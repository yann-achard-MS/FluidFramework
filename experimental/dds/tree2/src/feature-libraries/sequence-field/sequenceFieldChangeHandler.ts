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
import { sequenceFieldChangeCodecFactory } from "./sequenceFieldChangeEncoder";
import { SequenceFieldEditor, sequenceFieldEditor } from "./sequenceFieldEditor";
import { sequenceFieldToDelta } from "./sequenceFieldToDelta";
import { isEmpty } from "./utils";

export const SequenceAnchorSetURI = "SequenceAnchorSetURI";
export type SequenceAnchorSetURI = typeof SequenceAnchorSetURI;

// Registers the types used by the generic anchor set.
declare module "../modular-schema/anchorSetOps/anchorSetOpsRegistry" {
	interface AnchorSetOpsRegistry<TData> {
		[SequenceAnchorSetURI]: SequenceAnchorSetTypes<TData, Changeset>;
	}
}

export type SequenceFieldChangeHandler = FieldChangeHandler<
	SequenceAnchorSetURI,
	Changeset,
	SequenceFieldEditor
>;

export const sequenceFieldChangeHandler: SequenceFieldChangeHandler = {
	rebaser: sequenceFieldChangeRebaser,
	codecsFactory: sequenceFieldChangeCodecFactory,
	anchorSetOps: {
		rebase: () => {},
		composeWith: () => {},
		...sequenceFieldAnchorSetOps,
		codecsFactory: sequenceFieldAnchorSetOps.codecsFactory as any,
	},
	editor: sequenceFieldEditor,
	intoDelta: sequenceFieldToDelta,
	isEmpty,
};
