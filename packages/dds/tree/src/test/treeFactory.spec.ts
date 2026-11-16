/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import type { FormatVersion } from "../codec/index.js";
import { DetachedRootEditing, type SharedTreeOptions } from "../shared-tree/index.js";
import {
	EditManagerFormatVersion,
	MessageFormatVersion,
	editManagerCodecName,
	messageCodecName,
} from "../shared-tree-core/index.js";
import { configuredSharedTreeAlpha, resolveOptions, SharedTreeAlpha } from "../treeFactory.js";
import type { requireAssignableTo } from "../util/index.js";

describe("treeFactory", () => {
	describe("detached-root format options", () => {
		for (const options of [{}, { enableDetachedRootEditing: false }] as const) {
			it(`does not override released write versions for ${JSON.stringify(options)}`, () => {
				const resolved = resolveOptions(options);
				assert.equal(resolved.writeVersionOverrides, undefined);
				assert.equal(resolved.allowPossiblyIncompatibleWriteVersionOverrides, undefined);
				assert.doesNotThrow(() => configuredSharedTreeAlpha(options));
			});
		}

		it("selects experimental write versions with the provider", () => {
			const options = resolveOptions({ enableDetachedRootEditing: DetachedRootEditing });
			assert.equal(options.enableDetachedRootEditing, DetachedRootEditing);
			assert.deepEqual(
				options.writeVersionOverrides,
				new Map<string, FormatVersion>([
					[editManagerCodecName, EditManagerFormatVersion.vDetachedRoots],
					[messageCodecName, MessageFormatVersion.vDetachedRoots],
				]),
			);
			assert.equal(options.allowPossiblyIncompatibleWriteVersionOverrides, true);
			assert.doesNotThrow(() =>
				configuredSharedTreeAlpha({ enableDetachedRootEditing: DetachedRootEditing }),
			);
		});

		for (const enableSharedBranches of [false, true]) {
			it(`rejects legacy runtime true with shared branches ${enableSharedBranches}`, () => {
				// Simulate an untyped JavaScript caller of the former boolean option.
				const options = {
					enableDetachedRootEditing: true,
					enableSharedBranches,
				} as unknown as SharedTreeOptions;
				assert.throws(
					() => configuredSharedTreeAlpha(options),
					validateUsageError(/Import and pass DetachedRootEditing instead of true/),
				);
			});
		}

		it("rejects the provider combined with shared branches", () => {
			assert.throws(
				() =>
					configuredSharedTreeAlpha({
						enableDetachedRootEditing: DetachedRootEditing,
						enableSharedBranches: true,
					}),
				validateUsageError(
					/enableDetachedRootEditing cannot be used with enableSharedBranches/,
				),
			);
		});

		for (const options of [{}, { enableDetachedRootEditing: false }] as const) {
			it(`allows shared branches for ${JSON.stringify(options)}`, () => {
				const resolved = resolveOptions({ ...options, enableSharedBranches: true });
				assert.equal(
					resolved.writeVersionOverrides?.get(editManagerCodecName),
					EditManagerFormatVersion.vSharedBranches,
				);
				assert.equal(
					resolved.writeVersionOverrides?.get(messageCodecName),
					MessageFormatVersion.vSharedBranches,
				);
			});
		}
	});

	describe("configuredSharedTreeAlpha", () => {
		for (const [name, options] of [
			["default", {}],
			["non-default", { retainHistory: true }],
		] as const) {
			it(`preserves alpha kind capabilities with ${name} options`, () => {
				// Keep the inferred return type: an annotation or cast could hide the capability loss.
				const configured = configuredSharedTreeAlpha(options);
				type _kind = requireAssignableTo<typeof configured, typeof SharedTreeAlpha>;
				assert.equal(configured.type, SharedTreeAlpha.type);

				const adapted = configured.adapt(configured);
				type _adaptedKind = requireAssignableTo<typeof adapted, typeof SharedTreeAlpha>;
				assert.equal(adapted, configured);

				// Adaptation checks kind identity, not just the common SharedTree type identifier.
				assert.throws(
					() => configured.adapt(SharedTreeAlpha),
					validateUsageError(/Conflicting SharedObjectKinds with same type/),
				);
			});
		}
	});
});
