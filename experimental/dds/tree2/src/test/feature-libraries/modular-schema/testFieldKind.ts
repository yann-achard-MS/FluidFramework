/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TUnsafe, Type } from "@sinclair/typebox";
import {
	CrossFieldManager,
	FieldChangeHandler,
	FieldKindWithEditor,
	Multiplicity,
	NodeChangeComposer,
	NodeChangePruner,
	RevisionMetadataSource,
	SequenceAnchorSetTypes,
	sequenceFieldAnchorSetOps,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema";
import { IdAllocator, Mutable, fail } from "../../../util";
import { makeCodecFamily, makeValueCodec } from "../../../codec";
import { Delta, TaggedChange, tagChange } from "../../../core";
import { TestChange } from "../../testChange";

export interface TestFieldChangeset {
	kind: string;
	change: TestChange;
}

export const TestFieldAnchorSetURI = "TestFieldAnchorSetURI";
export type TestFieldAnchorSetURI = typeof TestFieldAnchorSetURI;

declare module "../../../feature-libraries/modular-schema/anchorSetOps/anchorSetOpsRegistry" {
	interface AnchorSetOpsRegistry<TData> {
		[TestFieldAnchorSetURI]: SequenceAnchorSetTypes<TData, TestFieldChangeset>;
	}
}

export type TestFieldKind = FieldKindWithEditor<
	unknown,
	Multiplicity.Sequence,
	string,
	TestFieldAnchorSetURI
>;

function makeTestFieldKind(kind: string): TestFieldKind {
	const handler: FieldChangeHandler<TestFieldAnchorSetURI> = {
		rebaser: {
			compose: (changes: TaggedChange<TestFieldChangeset>[]) => {
				// We don't expect ModularChangeFamily to compose empty lists of changes
				assert(changes.length > 0);
				for (const { change } of changes) {
					assert.equal(change.kind, kind);
				}
				return {
					kind,
					change: TestChange.compose(
						changes.map(({ change, revision }) => tagChange(change.change, revision)),
					),
				};
			},
			invert: ({ change }: TaggedChange<TestFieldChangeset>) => {
				assert.equal(change.kind, kind);
				return {
					kind,
					change: TestChange.invert(change.change),
				};
			},
			rebase: (change: TestFieldChangeset, over: TaggedChange<TestFieldChangeset>) => {
				assert.equal(change.kind, kind);
				assert.equal(over.change.kind, kind);
				return {
					kind,
					change:
						TestChange.rebase(change.change, over.change.change) ??
						fail("Unexpected empty change"),
				};
			},
			amendCompose: (
				composedChange: TestFieldChangeset,
				composeChild: NodeChangeComposer,
				genId: IdAllocator,
				crossFieldManager: CrossFieldManager,
				revisionMetadata: RevisionMetadataSource,
			) => {
				assert.equal(composedChange.kind, kind);
				throw new Error("Function not implemented.");
			},
			prune: (change: TestFieldChangeset, pruneChild: NodeChangePruner) => {
				assert.equal(change.kind, kind);
				return change;
			},
		},
		anchorSetOps: {
			rebase: () => {},
			composeWith: (setA, _, setB, merge) => {},
			...sequenceFieldAnchorSetOps,
			codecsFactory: sequenceFieldAnchorSetOps.codecsFactory as any,
		},
		codecsFactory: () =>
			makeCodecFamily([[0, makeValueCodec<TUnsafe<TestFieldChangeset>>(Type.Any())]]),
		editor: {},

		intoDelta: ({ change, revision }): Delta.FieldChanges => {
			const delta: Mutable<Delta.FieldChanges> = {};
			return delta;
		},
		isEmpty: (change) => TestChange.isEmpty(change.change),
	};
	return new FieldKindWithEditor(
		kind,
		Multiplicity.Sequence,
		handler,
		(a, b) => false,
		new Set(),
	);
}

export const testField1 = makeTestFieldKind("TestField1");
export const testField2 = makeTestFieldKind("TestField2");
