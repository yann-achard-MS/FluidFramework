/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldChangeHandler,
	GenericAnchor,
	genericChangeHandler,
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
	rebaser: sequenceFieldChangeRebaser,
	encoder: sequenceFieldChangeEncoder,
	editor: sequenceFieldEditor,
	getKey: genericChangeHandler.getKey.bind(genericChangeHandler),
	keyToDeltaKey: genericChangeHandler.keyToDeltaKey.bind(genericChangeHandler),
	intoDelta: sequenceFieldToDelta,
};
