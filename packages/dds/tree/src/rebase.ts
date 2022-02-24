/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Sequenced as S,
	Rebased as R,
} from "./format";
import { isChangeFrame, isConstraintFrame } from "./utils";

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
	if (isConstraintFrame(frame)) {
		return rebaseConstraintFrame(frame, original, base);
	} else if (isChangeFrame(frame)) {
		return rebaseChangeFrame(frame, original, base);
	}
	throw(new Error("Transaction frame is neither a constraint nor a change"));
}

function rebaseChangeFrame(
	frameToRebase: R.ChangeFrame,
	originalTransaction: R.Transaction,
	baseTransaction: S.Transaction,
): R.ChangeFrame {
	const baseSeq = baseTransaction.seq;
	// const sameClient = originalTransaction.client === baseTransaction.client;
	const moves: R.MoveEntry[] = [];

	const frameToFrame = (
		orig: R.ChangeFrame,
		base: R.ChangeFrame,
	): R.ChangeFrame => {
		return {
			...(moves.length === 0 ? {} : { moves }),
			marks: marksToMarks(orig.marks, base.marks),
		};
	};

	const marksToMarks = (
		orig: R.TraitMarks,
		base: R.TraitMarks,
	): R.TraitMarks => {
		const newMarks: R.TraitMarks = [];
		let iOrig = 0;
		let iBase = 0;
		while (iOrig < orig.length || iBase < base.length) {
			const mOrig = orig[iOrig];
			const mBase = base[iBase];
			if (mOrig === undefined) {
				assert(mBase !== undefined, "The while loop should have terminated");
				newMarks.push(typeof mBase === "number" ? mBase : scaffoldFrom(mBase, baseSeq));
				iBase += 1;
			} else if (mBase === undefined) {
				iOrig += 1;
			} else {
				iBase += 1;
				iOrig += 1;
			}
		}
		return newMarks;
	};

	let newFrame: R.ChangeFrame = frameToRebase;
	for (const baseFrame of baseTransaction.frames) {
		if (isChangeFrame(baseFrame)) {
			newFrame = frameToFrame(newFrame, baseFrame);
		}
	}
	return newFrame;
}

function rebaseConstraintFrame(
	frame: R.TransactionFrame,
	original: R.Transaction,
	base: S.Transaction,
): R.ConstraintFrame {
	throw new Error("Function not implemented.");
}

function scaffoldFrom(mBase: R.Mark, baseSeq: number): R.Prior {
	throw new Error("Function not implemented.");
}
