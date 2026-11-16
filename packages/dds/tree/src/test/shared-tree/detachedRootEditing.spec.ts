/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	currentVersion,
	makeCodecFamily,
	type CodecWriteOptions,
	type FormatVersion,
} from "../../codec/index.js";
import { rootFieldKey, makeAnonChange, type TaggedChange } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	FieldKinds,
	ModularChangeFamily,
	ModularChangeFormatVersion,
	TreeCompressionStrategy,
	fieldBatchCodecBuilder,
	fieldKindConfigurations,
	fieldKinds,
	intoDelta,
	makeModularChangeCodecFamily,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeOptionalFieldCodecFamily } from "../../feature-libraries/optional-field/optionalFieldCodecs.js";
import {
	DetachedRootEditing,
	type DetachedRootEditingSupport,
	type SharedTreeChange,
} from "../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SharedTreeChangeFamily } from "../../shared-tree/sharedTreeChangeFamily.js";
import {
	changeFormatVersionForEditManager,
	changeFormatVersionForMessage,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/sharedTree.js";
import {
	makeSharedTreeChangeCodecFamily,
	SharedTreeChangeFormatVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/sharedTreeChangeCodecs.js";
import {
	EditManagerFormatVersion,
	MessageFormatVersion,
	type SummaryData,
} from "../../shared-tree-core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeEditManagerCodecBuilder } from "../../shared-tree-core/editManagerCodecs.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeMessageCodecBuilder } from "../../shared-tree-core/messageCodecs.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { DecodedMessage } from "../../shared-tree-core/messageTypes.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { configuredSharedTree, configuredSharedTreeInternal } from "../../treeFactory.js";
import { brand } from "../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { makeModularChangeCodecFamilyWithDetachedRoots } from "../feature-libraries/modular-schema/codecTestUtils.js";
import {
	Change,
	normalizeDelta,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../feature-libraries/modular-schema/modularChangesetUtil.js";
import {
	chunkFromJsonTrees,
	assertDeltaEqual,
	mintRevisionTag,
	TestTreeProviderLite,
	testIdCompressor,
	testRevisionTagCodec,
} from "../utils.js";

const codecOptions: CodecWriteOptions = {
	jsonValidator: FormatValidatorBasic,
	minVersionForCollab: currentVersion,
};
const fieldBatchCodec = fieldBatchCodecBuilder.build(codecOptions);

function makeChangeFamily(
	support?: false | DetachedRootEditingSupport,
): SharedTreeChangeFamily {
	return new SharedTreeChangeFamily(
		testRevisionTagCodec,
		fieldBatchCodec,
		codecOptions,
		TreeCompressionStrategy.Uncompressed,
		testIdCompressor,
		support,
	);
}

function makeEnvelopeOptions(
	support?: false | DetachedRootEditingSupport,
): CodecWriteOptions & {
	changeCodecs: SharedTreeChangeFamily["codecs"];
	revisionTagCodec: typeof testRevisionTagCodec;
} {
	return {
		...codecOptions,
		changeCodecs: makeChangeFamily(support).codecs,
		revisionTagCodec: testRevisionTagCodec,
	};
}

const envelopeContext = {
	idCompressor: testIdCompressor,
	isSummary: true,
	hasSchemaChange: () => false,
};

function assertChangeEqual(actual: SharedTreeChange, expected: SharedTreeChange): void {
	assert.equal(actual.changes.length, expected.changes.length);
	for (let i = 0; i < actual.changes.length; i++) {
		const a = actual.changes[i];
		const b = expected.changes[i];
		assert(a.type === "data" && b.type === "data");
		// Released field codecs can introduce intermediate IDs when reconstructing replacements.
		assertDeltaEqual(
			normalizeDelta(intoDelta(makeAnonChange(a.innerChange))),
			normalizeDelta(intoDelta(makeAnonChange(b.innerChange))),
		);
	}
}

describe("detached-root editing provider", () => {
	it("keeps default modular and optional codec families released-only", () => {
		const modular = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			testRevisionTagCodec,
			fieldBatchCodec,
			codecOptions,
		);
		assert.deepEqual([...modular.getSupportedFormats()], [3, 4, 5]);
		assert.deepEqual(
			[...makeOptionalFieldCodecFamily(testRevisionTagCodec).getSupportedFormats()],
			[2],
		);
		for (const kind of [FieldKinds.optional, FieldKinds.required]) {
			assert.deepEqual(
				[...kind.changeHandler.codecsFactory(testRevisionTagCodec).getSupportedFormats()],
				[2],
			);
		}
		const enabled = makeModularChangeCodecFamilyWithDetachedRoots(
			fieldKindConfigurations,
			testRevisionTagCodec,
			fieldBatchCodec,
			codecOptions,
		);
		assert.deepEqual(
			[...enabled.getSupportedFormats()],
			[3, 4, 5, ModularChangeFormatVersion.vDetachedRoots],
		);
		assert.deepEqual([...modular.getSupportedFormats()], [3, 4, 5]);
	});

	it("does not silently omit missing released dependencies", () => {
		assert.throws(() => makeSharedTreeChangeCodecFamily(makeCodecFamily([]), codecOptions));
	});

	for (const [name, support] of [
		["omitted", undefined],
		["false", false],
		["provider", DetachedRootEditing],
	] as const) {
		const enabled = support !== undefined && support !== false;
		it(`registers consistent change and envelope formats with ${name}`, () => {
			const options = makeEnvelopeOptions(support);
			assert.deepEqual(
				[...options.changeCodecs.getSupportedFormats()],
				enabled ? [3, 4, 5, SharedTreeChangeFormatVersion.vDetachedRoots] : [3, 4, 5],
			);
			const messages = makeMessageCodecBuilder<SharedTreeChange>(enabled);
			const summaries = makeEditManagerCodecBuilder<SharedTreeChange>(enabled);
			const messageOptions = {
				...options,
				dependentChangeFormatVersion: changeFormatVersionForMessage,
			};
			const summaryOptions = {
				...options,
				dependentChangeFormatVersion: changeFormatVersionForEditManager,
			};
			assert.deepEqual(
				messages.applyOptions(messageOptions).map((entry) => entry.formatVersion),
				[
					undefined,
					1,
					2,
					3,
					4,
					5,
					6,
					7,
					MessageFormatVersion.vSharedBranches,
					...(enabled ? [MessageFormatVersion.vDetachedRoots] : []),
				],
			);
			assert.deepEqual(
				summaries.applyOptions(summaryOptions).map((entry) => entry.formatVersion),
				[
					1,
					2,
					3,
					4,
					5,
					6,
					7,
					EditManagerFormatVersion.vSharedBranches,
					...(enabled ? [EditManagerFormatVersion.vDetachedRoots] : []),
				],
			);
			assert.equal(messages.build(messageOptions).writeVersion, MessageFormatVersion.v7);
			assert.equal(summaries.build(summaryOptions).writeVersion, EditManagerFormatVersion.v7);
			assert.doesNotThrow(() => messages.buildDecoder(messageOptions));
			assert.doesNotThrow(() => summaries.buildDecoder(summaryOptions));
		});
	}

	for (const enabledFirst of [true, false]) {
		it(`isolates enabled and disabled kernels, enabled first: ${enabledFirst}`, () => {
			const sf = new SchemaFactory(`provider-isolation-${enabledFirst}`);
			class Root extends sf.object("Root", {
				optional: sf.optional(sf.number),
				required: sf.number,
			}) {}
			const config = new TreeViewConfiguration({ schema: Root });
			const providers = [enabledFirst, !enabledFirst].map((enabled) => ({
				enabled,
				provider: new TestTreeProviderLite(
					2,
					configuredSharedTree({
						...codecOptions,
						enableDetachedRootEditing: enabled ? DetachedRootEditing : false,
					}).getFactory(),
				),
			}));
			// Use both instances only after both constructors have run, to detect global registration.
			for (const { provider, enabled } of providers) {
				const view = provider.trees[0].viewWith(config);
				view.initialize({ optional: 1, required: 2 });
				provider.synchronizeMessages();
				view.root.optional = 3;
				view.root.required = 4;
				let message = provider.peekNextMessage();
				while ((message?.contents as { type?: string } | undefined)?.type === "idAllocation") {
					provider.synchronizeMessages({ count: 1 });
					message = provider.peekNextMessage();
				}
				assert(message !== undefined);
				const contents = message.contents as { version: unknown };
				assert.equal(
					contents.version,
					enabled ? MessageFormatVersion.vDetachedRoots : MessageFormatVersion.v7,
				);
				provider.synchronizeMessages();
				const peer = provider.trees[1].viewWith(config);
				assert.equal(peer.root.optional, 3);
				assert.equal(peer.root.required, 4);
			}
		});
	}

	for (const fieldKind of [
		"optional",
		"required",
		"detached optional",
		"detached required",
	] as const) {
		const detached = fieldKind.startsWith("detached");
		const changes: TaggedChange<SharedTreeChange>[] = [];
		const family = makeChangeFamily(DetachedRootEditing);
		const editor = family.buildEditor(mintRevisionTag, (edit) => changes.push(edit));
		const field = { field: rootFieldKey, parent: undefined };
		if (fieldKind.endsWith("required")) {
			editor.valueField(field).set(chunkFromJsonTrees([42]));
		} else {
			editor.optionalField(field).set(chunkFromJsonTrees([42]), false);
		}
		let { change } = changes[0];
		const { revision } = changes[0];
		assert(revision !== undefined);
		if (detached) {
			const inner = change.changes[0];
			assert(inner.type === "data");
			const modular = inner.innerChange;
			const fieldChange = modular.fieldChanges.get(rootFieldKey);
			assert(fieldChange !== undefined);
			const modularFamily = new ModularChangeFamily(
				fieldKinds,
				makeModularChangeCodecFamilyWithDetachedRoots(
					fieldKindConfigurations,
					testRevisionTagCodec,
					fieldBatchCodec,
					codecOptions,
				),
				codecOptions,
			);
			// Retarget the edit to a detached parent. The default editor still authors rebase version 1.
			change = {
				changes: [
					{
						type: "data",
						innerChange: Change.build(
							{
								family: modularFamily,
								rebaseVersion: 2,
								maxId: 10,
								builds: modular.builds,
								revisions:
									modular.revisions === undefined ? undefined : [...modular.revisions],
								roots: [
									{
										detachId: { revision: mintRevisionTag(), localId: brand(0) },
										detachLocation: { nodeId: undefined, field: rootFieldKey },
										change: Change.nodeWithId(
											0,
											{ revision, localId: brand(10) },
											Change.field(rootFieldKey, fieldChange.fieldKind, fieldChange.change),
										),
									},
								],
							},
							Change.field(rootFieldKey, FieldKinds.optional.identifier, {}),
						),
					},
				],
			};
		}

		for (const [messageVersion, summaryVersion] of [
			[MessageFormatVersion.v3, EditManagerFormatVersion.v3],
			[MessageFormatVersion.v4, EditManagerFormatVersion.v4],
			[MessageFormatVersion.v6, EditManagerFormatVersion.v6],
			[MessageFormatVersion.v7, EditManagerFormatVersion.v7],
			[MessageFormatVersion.vSharedBranches, EditManagerFormatVersion.vSharedBranches],
			[MessageFormatVersion.vDetachedRoots, EditManagerFormatVersion.vDetachedRoots],
		] as const) {
			const experimental = messageVersion === MessageFormatVersion.vDetachedRoots;
			if (detached && !experimental) {
				continue;
			}
			it(`round trips ${fieldKind} through message ${messageVersion} and summary ${summaryVersion}`, () => {
				const options = {
					...makeEnvelopeOptions(experimental ? DetachedRootEditing : undefined),
					writeVersionOverrides: new Map<string, FormatVersion>([
						["Message", messageVersion],
						["EditManager", summaryVersion],
					]),
					allowPossiblyIncompatibleWriteVersionOverrides: true,
				};
				const messages = makeMessageCodecBuilder<SharedTreeChange>(experimental).build({
					...options,
					dependentChangeFormatVersion: changeFormatVersionForMessage,
				});
				const summaries = makeEditManagerCodecBuilder<SharedTreeChange>(experimental).build({
					...options,
					dependentChangeFormatVersion: changeFormatVersionForEditManager,
				});
				const message: DecodedMessage<SharedTreeChange> = {
					type: "commit",
					branchId: "main",
					sessionId: testIdCompressor.localSessionId,
					commit: { change, revision, customMetadata: undefined },
				};
				assert(message.type === "commit");
				const encodedMessage = messages.encode(message, envelopeContext);
				const decodedMessage = messages.decode(encodedMessage, envelopeContext);
				assert(decodedMessage.type === "commit");
				assert.equal(decodedMessage.commit.revision, revision);
				assertChangeEqual(decodedMessage.commit.change, change);
				const summary: SummaryData<SharedTreeChange> = {
					originator: testIdCompressor.localSessionId,
					main: {
						trunk: [
							{ ...message.commit, sessionId: message.sessionId, sequenceNumber: brand(1) },
						],
						peerLocalBranches: new Map(),
					},
				};
				const encodedSummary = summaries.encode(summary, envelopeContext);
				const decodedSummary = summaries.decode(encodedSummary, envelopeContext);
				assert.equal(decodedSummary.main.trunk[0].revision, revision);
				assertChangeEqual(decodedSummary.main.trunk[0].change, change);
				if (experimental) {
					const disabled = makeEnvelopeOptions();
					const messageOptions = {
						...disabled,
						dependentChangeFormatVersion: changeFormatVersionForMessage,
					};
					const summaryOptions = {
						...disabled,
						dependentChangeFormatVersion: changeFormatVersionForEditManager,
					};
					for (const decoder of [
						makeMessageCodecBuilder<SharedTreeChange>(false).build(messageOptions),
						makeMessageCodecBuilder<SharedTreeChange>(false).buildDecoder(messageOptions),
					]) {
						assert.throws(
							() => decoder.decode(encodedMessage, envelopeContext),
							validateUsageError(
								/Unsupported version detached-roots\|v0.1 encountered while decoding Message data/,
							),
						);
					}
					for (const decoder of [
						makeEditManagerCodecBuilder<SharedTreeChange>(false).build(summaryOptions),
						makeEditManagerCodecBuilder<SharedTreeChange>(false).buildDecoder(summaryOptions),
					]) {
						assert.throws(
							() => decoder.decode(encodedSummary, envelopeContext),
							validateUsageError(
								/Unsupported version detached-roots\|v0.1 encountered while decoding EditManager data/,
							),
						);
					}
				}
			});
		}
	}

	for (const codecName of ["Message", "EditManager"]) {
		for (const allowPossiblyIncompatibleWriteVersionOverrides of [false, true]) {
			it(`rejects ${codecName} write override without provider, incompatible allowed: ${allowPossiblyIncompatibleWriteVersionOverrides}`, () => {
				assert.throws(
					() =>
						new TestTreeProviderLite(
							1,
							configuredSharedTreeInternal({
								...codecOptions,
								writeVersionOverrides: new Map([
									[codecName, MessageFormatVersion.vDetachedRoots],
								]),
								allowPossiblyIncompatibleWriteVersionOverrides,
							}).getFactory(),
						),
					validateUsageError(/does not support requested format version.*detached-roots/),
				);
			});
		}
	}
});
