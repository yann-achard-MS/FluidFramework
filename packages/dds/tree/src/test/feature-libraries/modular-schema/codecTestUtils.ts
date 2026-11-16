/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeCodecFamily, type FormatVersion } from "../../../codec/index.js";
import {
	makeModularChangeCodecFamily,
	ModularChangeFormatVersion,
} from "../../../feature-libraries/index.js";
import { DetachedRootEditing } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getDetachedRootCodecFactory } from "../../../shared-tree/detachedRootEditingSupport.js";

/**
 * Explicitly registers the experimental codec for tests that cover all default field formats.
 */
export function makeModularChangeCodecFamilyWithDetachedRoots(
	...args: Parameters<typeof makeModularChangeCodecFamily>
): ReturnType<typeof makeModularChangeCodecFamily> {
	const [, revisionCodec, fieldBatchCodec, codecOptions, compressionStrategy] = args;
	const released = makeModularChangeCodecFamily(...args);
	return makeCodecFamily([
		...[...released.getSupportedFormats()].map(
			(version): [FormatVersion, ReturnType<typeof released.resolve>] => [
				version,
				released.resolve(version),
			],
		),
		[
			ModularChangeFormatVersion.vDetachedRoots,
			getDetachedRootCodecFactory(DetachedRootEditing)(
				revisionCodec,
				fieldBatchCodec,
				codecOptions,
				compressionStrategy,
			),
		],
	]);
}
