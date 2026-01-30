/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangeAtomId } from "../core/index.js";
import type {
	DefaultChangeFamily,
	DefaultChangeset,
	DetachedRootIds,
	DataEditor,
	TreeChunk,
} from "../feature-libraries/index.js";

import { mintRevisionTag } from "./utils.js";

export type Editor = (builder: DataEditor<TreeChunk, ChangeAtomId, DetachedRootIds>) => void;

export function makeEditMinter(
	family: DefaultChangeFamily,
	editor: Editor,
): () => DefaultChangeset {
	let builtChangeset: DefaultChangeset | undefined;
	const innerEditor = family.buildEditor(mintRevisionTag, (taggedChange) => {
		assert(builtChangeset === undefined);
		builtChangeset = taggedChange.change;
	});
	return (): DefaultChangeset => {
		assert(builtChangeset === undefined);
		editor(innerEditor);
		assert(builtChangeset !== undefined);
		const changeset = builtChangeset;
		builtChangeset = undefined;
		return changeset;
	};
}
