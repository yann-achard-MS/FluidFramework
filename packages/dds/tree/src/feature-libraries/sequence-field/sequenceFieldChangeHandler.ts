/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	baseChangeHandlerKeyFunctions,
	FieldChangeHandler,
	GenericNodeKey,
} from "../modular-schema";
import { Changeset } from "./format";
import { sequenceFieldChangeRebaser } from "./sequenceFieldChangeRebaser";
import { sequenceFieldChangeEncoder } from "./sequenceFieldChangeEncoder";
import { SequenceFieldEditor, sequenceFieldEditor } from "./sequenceFieldEditor";
import { sequenceFieldToDelta } from "./sequenceFieldToDelta";
import { anchorSetFactory } from "./sequenceFieldAnchorSet";

export type SequenceFieldChangeHandler = FieldChangeHandler<
	Changeset,
	GenericNodeKey,
	SequenceFieldEditor
>;

export const sequenceFieldChangeHandler: SequenceFieldChangeHandler = {
	...baseChangeHandlerKeyFunctions,
	anchorSetFactory,
	rebaser: sequenceFieldChangeRebaser,
	encoder: sequenceFieldChangeEncoder,
	editor: sequenceFieldEditor,
	intoDelta: sequenceFieldToDelta,
};
