/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	baseChangeHandlerKeyFunctions,
	FieldChangeHandler,
	GenericAnchor,
	GenericNodeKey,
} from "../modular-schema";
import { Changeset } from "./format";
import { sequenceFieldChangeRebaser } from "./sequenceFieldChangeRebaser";
import { sequenceFieldChangeEncoder } from "./sequenceFieldChangeEncoder";
import { SequenceFieldEditor, sequenceFieldEditor } from "./sequenceFieldEditor";
import { sequenceFieldToDelta } from "./sequenceFieldToDelta";

export type SequenceFieldChangeHandler = FieldChangeHandler<
	Changeset,
	GenericNodeKey,
	GenericAnchor,
	SequenceFieldEditor
>;

export const sequenceFieldChangeHandler: SequenceFieldChangeHandler = {
	...baseChangeHandlerKeyFunctions,
	rebaser: sequenceFieldChangeRebaser,
	encoder: sequenceFieldChangeEncoder,
	editor: sequenceFieldEditor,
	intoDelta: sequenceFieldToDelta,
};
