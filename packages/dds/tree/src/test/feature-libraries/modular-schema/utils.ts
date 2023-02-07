/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldChangeHandler,
	FieldKind,
	Multiplicity,
	FieldKinds,
	baseChangeHandlerKeyFunctions,
	noRebaseAnchorSetFactoryFactory,
} from "../../../feature-libraries";
import { Delta } from "../../../core";
import { brand, JsonCompatibleReadOnly } from "../../../util";
import { singleJsonCursor } from "../../../domains";

export type ValueChangeset = FieldKinds.ReplaceOp<number>;

export const valueHandler: FieldChangeHandler<ValueChangeset> = {
	...baseChangeHandlerKeyFunctions,
	anchorSetFactory: noRebaseAnchorSetFactoryFactory<ValueChangeset>(),
	rebaser: FieldKinds.replaceRebaser(),
	encoder: FieldKinds.valueEncoder<ValueChangeset & JsonCompatibleReadOnly>(),
	editor: {},
	intoDelta: (change): Delta.MarkList =>
		change === 0
			? []
			: [
					{ type: Delta.MarkType.Delete, count: 1 },
					{ type: Delta.MarkType.Insert, content: [singleJsonCursor(change.new)] },
			  ],
};

export const valueField = new FieldKind(
	brand("Value"),
	Multiplicity.Value,
	valueHandler,
	(a, b) => false,
	new Set(),
);
