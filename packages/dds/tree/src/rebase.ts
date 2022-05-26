/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Sequenced as S,
	Rebased as R,
	SeqNumber,
} from "./format";
import { normalizeFrame } from "./normalize";
import {
	clone,
} from "./utils";

export function rebase(original: R.Transaction, base: S.Transaction): R.Transaction {
	return {
		ref: original.ref,
		newRef: base.seq,
		frames: original.frames.map((frame) => rebaseFrame(frame, original, base)),
	};
}

function rebaseFrame(
	frame: R.TransactionFrame,
	original: R.Transaction,
	base: S.Transaction,
): R.TransactionFrame {
	// TODO: account for constraint frames
	return rebaseChangeFrame(frame, original, base);
}

function rebaseChangeFrame(
	frameToRebase: R.ChangeFrame,
	originalTransaction: R.Transaction,
	baseTransaction: S.Transaction,
): R.ChangeFrame {
	const baseSeq = baseTransaction.seq;
	const newFrame: R.ChangeFrame = clone(frameToRebase);
	for (const baseFrame of baseTransaction.frames) {
		rebaseOverFrame(newFrame, baseFrame, baseSeq);
	}
	normalizeFrame(newFrame);
	return newFrame;
}

function rebaseOverFrame(
	orig: R.ChangeFrame,
	base: R.ChangeFrame,
	baseSeq: SeqNumber,
): void {
	rebaseMarks(orig.marks, base.marks, { baseSeq, base });
}

function rebaseMarks(
	curr: R.TraitMarks,
	base: R.TraitMarks,
	context: Context,
): void {
}

// function rebaseOverModify(mark: R.Modify, baseMark: R.Modify, context: Context): void {
// 	if (mark.modify === undefined) {
// 		mark.modify = {};
// 	}
// 	for (const [k,v] of Object.entries(baseMark.modify ?? {})) {
// 		if (k in mark.modify) {
// 			console.log(`Entering trait ${k}`);
// 			rebaseMarks(mark.modify[k], v, context);
// 			console.log(`Exiting trait ${k}`);
// 		} else {
// 			// The line below is disabled because we shouldn't need priors in traits
// 			// that the rebased change doesn't touch. Note that it's still an open
// 			// question of whether that's still true in the case of slice moves (see scenario G).
// 			// mark.modify[k] = priorsFromTraitMarks([], v, context);
// 		}
// 	}
// }

interface Context {
	baseSeq: SeqNumber;
	base: R.ChangeFrame;
}
