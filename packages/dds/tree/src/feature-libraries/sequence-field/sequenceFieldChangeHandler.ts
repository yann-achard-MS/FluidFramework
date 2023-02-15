/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldChangeHandler,
	SequenceAnchorSetTypes,
	sequenceFieldAnchorSetOps,
} from "../modular-schema";
import { Changeset } from "./format";
import { sequenceFieldChangeRebaser } from "./sequenceFieldChangeRebaser";
import { sequenceFieldChangeEncoder } from "./sequenceFieldChangeEncoder";
import { SequenceFieldEditor, sequenceFieldEditor } from "./sequenceFieldEditor";
import { sequenceFieldToDelta } from "./sequenceFieldToDelta";

export const SequenceFieldAnchorSetURI = "SequenceFieldAnchorSetURI";
export type SequenceFieldAnchorSetURI = typeof SequenceFieldAnchorSetURI;

// Registers the types used by the value field anchor set.
declare module "../modular-schema/anchorSetOpsRegistry" {
	interface AnchorSetOpsRegistry<TData> {
		[SequenceFieldAnchorSetURI]: SequenceAnchorSetTypes<TData, Changeset>;
	}
}

export const sequenceFieldChangeHandler: FieldChangeHandler<
	SequenceFieldAnchorSetURI,
	SequenceFieldEditor
> = {
	anchorSetOps: {
		rebase: () => {},
		composeWith: () => {},
		...sequenceFieldAnchorSetOps,
	},
	rebaser: sequenceFieldChangeRebaser,
	encoder: sequenceFieldChangeEncoder,
	editor: sequenceFieldEditor,
	intoDelta: sequenceFieldToDelta,
};
