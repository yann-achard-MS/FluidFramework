/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Rebased as R,
	SeqNumber,
} from "./format";
import { normalizeMarks } from "./normalize";
import {
	clone,
} from "./utils";

export function invert(frame: R.ChangeFrame, seq: SeqNumber): R.ChangeFrame {
	const context: Context = {
		frame,
		seq,
		underDelete: false,
	};
	const moves = frame.moves?.map((mv) => ({ id: mv.id, src: clone(mv.dst), dst: clone(mv.src) }));
	const marks = invertMarks(frame.marks, context);
	normalizeMarks(marks);

	if (moves !== undefined) {
		return {
			moves,
			marks,
		};
	}
	return {
		marks,
	};
}

interface Context {
	readonly frame: Readonly<R.ChangeFrame>
	readonly seq: SeqNumber;
	readonly underDelete: boolean;
}

function invertMarks(marks: R.TraitMarks, context: Context): R.TraitMarks {
	// const { seq } = context;
	const newMarks: R.TraitMarks = {};
	return newMarks;
}

// function invertMarksOpt(marks: R.TraitMarks | undefined, context: Context): R.TraitMarks | undefined {
// 	if (marks === undefined) {
// 		return undefined;
// 	}
// 	return invertMarks(marks, context);
// }

// function invertModify(
// 	modify: R.Modify,
// 	context: Context,
// ): R.Modify | Offset {
// 	const newModify: R.Modify = mapObject(modify, (traitMarks) => invertMarks(traitMarks, context));
// 	return newModify;
// }
