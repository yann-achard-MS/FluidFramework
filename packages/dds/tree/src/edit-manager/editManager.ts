/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import {
    IGarbageCollectionData,
    ISummaryTreeWithStats,
    ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { ChangeFamily } from "../change-family";
import {
    Index,
    SummaryElement,
    SummaryElementParser,
    SummaryElementStringifier,
} from "../shared-tree-core";
import { AnchorSet, Delta } from "../tree";
import { Brand, fail, JsonCompatibleReadOnly, RecursiveReadonly } from "../util";

export interface Commit<TChangeset> {
    sessionId: SessionId;
    seqNumber: SeqNumber;
    refNumber: SeqNumber;
    changeset: TChangeset;
}

export type SeqNumber = Brand<number, "edit-manager.SeqNumber">;
export type SessionId = string;

/**
 * The storage key for the blob in the summary containing EditManager data
 */
const blobKey = "EditManagerBlob";

const stringKey = "EditManagerString";

/**
 * Represents a local branch of a document and interprets the effect on the document of adding sequenced changes,
 * which were based on a given session's branch, to the document history
 */
// TODO: Remove commits when they are no longer in the collab window
// TODO: Try to reduce this to a single type parameter
// TODO: Move logic into Rebaser if possible
export class EditManager<TChangeset, TChangeFamily extends ChangeFamily<any, TChangeset>>
    implements Index<TChangeset>, SummaryElement {
    // The trunk represents the list of received sequenced changes.
    // The change in each commit is rebased onto the previous change in the list.
    private readonly trunk: Commit<TChangeset>[] = [];
    /**
     * Branches are maintained to represent the local change list that the issuing client would have had
     * at the time of submitting the last edit on the branch.
     * This means the last change on a branch is always in its original (non-rebased) form.
     */
    private readonly branches: Map<SessionId, Branch<TChangeset>> = new Map();
    // This is the ordered list of changes made by this client which have not yet been confirmed as sequenced changes.
    // The first change in this list is based on the last change in the trunk.
    // Every other change in this list is based on the change preceding it.
    private localChanges: TChangeset[] = [];

    public readonly summaryElement?: SummaryElement = this;
    public readonly key = "EditManager";

    private readonly commitEncoder: CommitEncoder<TChangeset>;

    private localSessionId?: SessionId;

    public constructor(
        public readonly changeFamily: TChangeFamily,
        public readonly anchors?: AnchorSet,
    ) {
        this.commitEncoder = commitEncoderFromFamily<TChangeset, TChangeFamily>(changeFamily);
    }

    public setSessionId(id: SessionId): void {
        assert(this.localSessionId === undefined, "The session ID should only be set once");
        this.localSessionId = id;
    }

    public getAttachSummary(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();
        const dataString = encodeSummary(
            { trunk: this.trunk, branches: this.branches },
            this.commitEncoder,
        );
        builder.addBlob(stringKey, dataString);
        return builder.getSummaryTree();
    }

    public async summarize(
        stringify: SummaryElementStringifier,
        fullTree?: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummaryTreeWithStats> {
        return this.getAttachSummary(stringify, fullTree, trackState, telemetryContext);
    }

    public getGCData(fullGC?: boolean): IGarbageCollectionData {
        // TODO: Properly implement garbage collection. Right now, garbage collection is performed automatically
        // by the code in SharedObject (from which SharedTreeCore extends). The `runtime.uploadBlob` API delegates
        // to the `BlobManager`, which automatically populates the summary with ISummaryAttachment entries for each
        // blob.
        return {
            gcNodes: {},
        };
    }

    public async load(
        services: IChannelStorageService,
        parse: SummaryElementParser,
    ): Promise<void> {
        const [hasString, hasBlob] = await Promise.all([
            services.contains(stringKey),
            services.contains(blobKey),
        ]);
        assert(hasString || hasBlob, "EditManager data is required in summary");
        let schemaBuffer: ArrayBufferLike;
        if (hasBlob) {
            const handleBuffer = await services.readBlob(blobKey);
            const handleString = bufferToString(handleBuffer, "utf-8");
            const handle = parse(handleString) as IFluidHandle<ArrayBufferLike>;
            schemaBuffer = await handle.get();
        } else {
            schemaBuffer = await services.readBlob(stringKey);
        }

        // After the awaits, validate that the data is in a clean state.
        // This detects any data that could have been accidentally added through
        // invalid means and is about to be overwritten.
        assert(
            this.trunk.length === 0 && this.branches.size === 0,
            "There should not already be stored EditManager data when loading from summary",
        );

        const dataString = bufferToString(schemaBuffer, "utf-8");
        loadSummary(dataString, this.commitEncoder, { trunk: this.trunk, branches: this.branches });
    }

    public getTrunk(): readonly RecursiveReadonly<Commit<TChangeset>>[] {
        return this.trunk;
    }

    public getLastSequencedChange(): TChangeset {
        return (this.getLastCommit() ?? fail("No sequenced changes")).changeset;
    }

    public getLastCommit(): Commit<TChangeset> | undefined {
        return this.trunk[this.trunk.length - 1];
    }

    public getLocalChanges(): readonly RecursiveReadonly<TChangeset>[] {
        return this.localChanges;
    }

    public addSequencedChange(newCommit: Commit<TChangeset>): Delta.Root {
        assert(
            this.localSessionId !== undefined,
            "The session ID should be set before processing changes",
        );

        if (this.trunk.length > 0) {
            const lastSeqNumber = this.trunk[this.trunk.length - 1].seqNumber;
            assert(
                newCommit.seqNumber > lastSeqNumber,
                0x3a2 /* Incoming remote op sequence# <= local collabWindow's currentSequence# */,
            );
        }
        if (newCommit.sessionId === this.localSessionId) {
            // `newCommit` should correspond to the oldest change in `localChanges`, so we move it into trunk.
            // `localChanges` are already rebased to the trunk, so we can use the stored change instead of rebasing the
            // change in the incoming commit.
            const changeset = this.localChanges.shift() ?? fail(UNEXPECTED_SEQUENCED_LOCAL_EDIT);
            this.trunk.push({
                ...newCommit,
                changeset,
            });
            return Delta.empty;
        }

        const branch = this.getOrCreateBranch(newCommit.sessionId, newCommit.refNumber);
        this.updateBranch(branch, newCommit.refNumber);
        const newChangeFullyRebased = this.rebaseChangeFromBranchToTrunk(newCommit, branch);
        this.addCommitToBranch(branch, newCommit);

        // Note: we never use the refNumber of a commit in the trunk
        this.trunk.push({
            ...newCommit,
            changeset: newChangeFullyRebased,
        });

        return this.changeFamily.intoDelta(this.rebaseLocalBranch(newChangeFullyRebased));
    }

    /**
     * Add `newCommit` to the tip of the `branch` and updates the branch's `isDivergent` flag.
     */
    private addCommitToBranch(branch: Branch<TChangeset>, newCommit: Commit<TChangeset>): void {
        branch.localChanges.push(newCommit);
        const lastCommit = this.getLastCommit();
        if (lastCommit === undefined || newCommit.refNumber === lastCommit.seqNumber) {
            branch.isDivergent = false;
        } else {
            branch.isDivergent ||= newCommit.sessionId !== lastCommit.sessionId;
        }
    }

    public addLocalChange(change: TChangeset): Delta.Root {
        assert(
            this.localSessionId !== undefined,
            "The session ID should be set before processing changes",
        );

        this.localChanges.push(change);

        if (this.anchors !== undefined) {
            this.changeFamily.rebaser.rebaseAnchors(this.anchors, change);
        }

        return this.changeFamily.intoDelta(change);
    }

    private rebaseChangeFromBranchToTrunk(
        commitToRebase: Commit<TChangeset>,
        branch: Branch<TChangeset>,
    ): TChangeset {
        if (!branch.isDivergent && commitToRebase.sessionId === this.getLastCommit()?.sessionId) {
            // The new commit is not divergent and therefore doesn't need to be rebased.
            return commitToRebase.changeset;
        }

        const changeRebasedToRef = branch.localChanges.reduceRight(
            (newChange, branchCommit) =>
                this.changeFamily.rebaser.rebase(
                    newChange,
                    this.changeFamily.rebaser.invert(branchCommit.changeset),
                ),
            commitToRebase.changeset,
        );

        return this.rebaseOverCommits(changeRebasedToRef, this.getCommitsAfter(branch.refSeq));
    }

    // TODO: Try to share more logic between this method and `rebaseBranch`
    private rebaseLocalBranch(trunkChange: TChangeset): TChangeset {
        const newBranchChanges: TChangeset[] = [];
        const inverses: TChangeset[] = [];

        for (const localChange of this.localChanges) {
            let change = this.rebaseChange(localChange, inverses);
            change = this.changeFamily.rebaser.rebase(change, trunkChange);
            change = this.rebaseChange(change, newBranchChanges);

            newBranchChanges.push(change);

            inverses.unshift(this.changeFamily.rebaser.invert(localChange));
        }

        const netChange = this.changeFamily.rebaser.compose([
            ...inverses,
            trunkChange,
            ...newBranchChanges,
        ]);

        if (this.anchors !== undefined) {
            this.changeFamily.rebaser.rebaseAnchors(this.anchors, netChange);
        }

        this.localChanges = newBranchChanges;
        return netChange;
    }

    /**
     * Updates the `branch` to reflect the local changes that the session owner would have had after
     * they learned of the commit with sequence number `newRef` being sequenced.
     * This is accomplished by rebasing the branch's changes over any new trunk changes up to and including `newRef`.
     * Changes with sequence number less than or equal to `newRef` are removed from the branch,
     * since they are now part of the trunk this branch is based on.
     * @param branch - The branch to update.
     * @param newRef - The point in the trunk to rebase the branch up to.
     */
    private updateBranch(branch: Branch<TChangeset>, newRef: SeqNumber) {
        const trunkChanges = this.getCommitsAfterAndUpToInclusive(branch.refSeq, newRef);
        if (trunkChanges.length === 0) {
            // This early return avoids rebasing the branch changes over an empty sandwich.
            return;
        }
        const newBranchChanges: Commit<TChangeset>[] = [];
        const inverses: TChangeset[] = [];

        for (const commit of branch.localChanges) {
            if (commit.seqNumber > newRef) {
                let change = this.rebaseChange(commit.changeset, inverses);
                change = this.rebaseOverCommits(change, trunkChanges);
                change = this.rebaseOverCommits(change, newBranchChanges);

                newBranchChanges.push({
                    ...commit,
                    changeset: change,
                });
            }

            inverses.unshift(this.changeFamily.rebaser.invert(commit.changeset));
        }

        branch.localChanges = newBranchChanges;
        branch.refSeq = newRef;
    }

    private rebaseOverCommits(changeToRebase: TChangeset, commits: Commit<TChangeset>[]) {
        return this.rebaseChange(
            changeToRebase,
            commits.map((commit) => commit.changeset),
        );
    }

    private rebaseChange(changeToRebase: TChangeset, changesToRebaseOver: TChangeset[]) {
        return changesToRebaseOver.reduce(
            (a, b) => this.changeFamily.rebaser.rebase(a, b),
            changeToRebase,
        );
    }

    /**
     * @param pred - The sequence number of the commit immediately before the commits of interest.
     * @param last - The sequence number of the last commit of interest.
     * @returns The trunk commits with sequence numbers greater than `pred` and smaller or equal to `last`,
     * ordered in sequencing order.
     */
    private getCommitsAfterAndUpToInclusive(
        pred: SeqNumber,
        last: SeqNumber,
    ): Commit<TChangeset>[] {
        // This check is just a fast-path for the common case where no concurrent edits occurred.
        if (pred === last) {
            return [];
        }
        const firstIndex = this.getCommitIndexAfter(pred);
        const lastIndex = this.getCommitIndexAfter(last);
        return this.trunk.slice(firstIndex, lastIndex);
    }

    /**
     * @param pred - The sequence number of the commit immediately before the commits of interest.
     * @returns The trunk commits with sequence numbers greater than `pred`
     */
    private getCommitsAfter(pred: SeqNumber): Commit<TChangeset>[] {
        const firstIndex = this.getCommitIndexAfter(pred);
        return this.trunk.slice(firstIndex);
    }

    /**
     * @param seqNumber - The sequence number of an operation.
     * It is acceptable for the trunk not to contain a commit with that sequence number.
     * @returns The index of the earliest commit with a sequence number greater than `seqNumber`.
     * Note that such a commit is not guaranteed to exist in the trunk
     * (i.e. the return value may be equal to the length of the trunk).
     */
    private getCommitIndexAfter(seqNumber: SeqNumber): number {
        for (let index = this.trunk.length - 1; index >= 0; --index) {
            if (this.trunk[index].seqNumber <= seqNumber) {
                return index + 1;
            }
        }
        return 0;
    }

    private getOrCreateBranch(sessionId: SessionId, refSeq: SeqNumber): Branch<TChangeset> {
        if (!this.branches.has(sessionId)) {
            this.branches.set(sessionId, { localChanges: [], refSeq, isDivergent: false });
        }
        return this.branches.get(sessionId) as Branch<TChangeset>;
    }
}

interface Branch<TChangeset> {
    localChanges: Commit<TChangeset>[];
    refSeq: SeqNumber;
    /**
     * A branch is divergent iff it has local changes and there is a change outside the branch with a `seqNumber`
     * between the branch's `refSeq` and the `seqNumber` of the last change in the branch.
     * In other words, the ref commit followed by the local changes
     * do not form a contiguous block in the trunk or final sequence.
     *
     * Note that a commit whose ref number does not match the latest sequence number at the time of its
     * sequencing is not necessarily divergent: if the commit is from the peer who issued the preceding commit,
     * and that preceding commit was not divergent, then the new commit is not divergent either.
     *
     * More formally, given:
     *
     * - A new commit `c`
     *
     * - The function `prev(x)` that returns the commit sequenced immediately before commit `x`:
     *
     * ```typescript
     * isDivergent(c) =
     *     prev(c) !== undefined
     *     && c.refNumber !== prev(c).seqNumber
     *     && (prev(c).sessionId !== c.sessionId || isDivergent(prev(c)))
     * ```
     */
    isDivergent: boolean;
}

const UNEXPECTED_SEQUENCED_LOCAL_EDIT =
    "Received a sequenced change from the local session despite having no local changes";

/**
 * The in-memory data that summaries contain.
 * Note that this interface gives mutable access to the data.
 * Passed to {@link loadSummary}.
 */
export interface MutableSummaryData<TChangeset> {
    readonly trunk: Commit<TChangeset>[];
    readonly branches: Map<SessionId, Branch<TChangeset>>;
}

/**
 * The in-memory data that summaries contain.
 * Passed to {@link encodeSummary}.
 */
export interface ReadonlySummaryData<TChangeset> {
    readonly trunk: readonly Readonly<Commit<TChangeset>>[];
    readonly branches: ReadonlyMap<SessionId, Readonly<Branch<TChangeset>>>;
}

/**
 * The in-memory data that summaries contain, in a JSON-compatible format.
 * Used as an implementation detail of {@link loadSummary} and {@link encodeSummary}.
 */
interface ReadonlyJsonSummaryData {
    readonly trunk: readonly Readonly<Commit<JsonCompatibleReadOnly>>[];
    readonly branches: readonly [SessionId, Readonly<Branch<JsonCompatibleReadOnly>>][];
}

export interface CommitEncoder<TChange> {
    readonly encode: (commit: Commit<TChange>) => Commit<JsonCompatibleReadOnly>;
    readonly decode: (commit: Commit<JsonCompatibleReadOnly>) => Commit<TChange>;
}

export function commitEncoderFromFamily<
    TChangeset,
    TChangeFamily extends ChangeFamily<any, TChangeset>,
>(changeFamily: TChangeFamily): CommitEncoder<TChangeset> {
    return {
        encode: (commit: Commit<TChangeset>): Commit<JsonCompatibleReadOnly> => ({
            ...commit,
            changeset: changeFamily.encoder.encodeForJson(0, commit.changeset),
        }),
        decode: (commit: Commit<JsonCompatibleReadOnly>): Commit<TChangeset> => ({
            ...commit,
            changeset: changeFamily.encoder.decodeJson(0, commit.changeset),
        }),
    };
}

export function loadSummary<TChange>(
    summary: string,
    encoder: CommitEncoder<TChange>,
    repo: MutableSummaryData<TChange>,
): void {
    const decode = (c: Commit<JsonCompatibleReadOnly>) => encoder.decode(c);
    const { trunk, branches } = repo;
    const json: ReadonlyJsonSummaryData = JSON.parse(summary);
    for (const commit of json.trunk) {
        trunk.push(decode(commit));
    }
    for (const [k, b] of json.branches) {
        const branch: Branch<TChange> = { ...b, localChanges: b.localChanges.map(decode) };
        branches.set(k, branch);
    }
}

export function encodeSummary<TChange>(
    data: ReadonlySummaryData<TChange>,
    encoder: CommitEncoder<TChange>,
): string {
    const encode = (c: Commit<TChange>) => encoder.encode(c);
    const json: ReadonlyJsonSummaryData = {
        trunk: data.trunk.map(encode),
        branches: Array.from(data.branches.entries(), ([k, b]) => [
            k,
            { ...b, localChanges: b.localChanges.map(encode) },
        ]),
    };
    return JSON.stringify(json);
}
