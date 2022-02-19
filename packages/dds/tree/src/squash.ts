/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	SeqNumber,
	Sequenced as S,
	Rebased as R,
	Offset,
	ClientId,
} from "./format";
import { isChangeFrame, isConstraintFrame, isModify, isOffset, markLength } from "./utils";

export type Transaction = R.Transaction | S.Transaction;

export function squash(transactions: Transaction[]): R.ChangeFrame {
	const out = {
		moves: [],
		marks: [],
	};

	for (const transaction of transactions) {
		const client = transaction.client;
		for (const frame of transaction.frames) {
			if (isChangeFrame(frame)) {
				squashMarks(out, client, frame);
			}
		}
	}

	return out;
}

interface Pointer {
	iMark: number;
	iNode: number;
}

function squashMarks(
	{ moves, marks }: { moves: R.MoveEntry[], marks: R.TraitMarks },
	client: ClientId,
	frame: R.ChangeFrame,
): void {
	let ptr: Pointer = { iNode: 0, iMark: 0 };
	for (const newMark of frame.marks) {
		if (isOffset(newMark)) {
			ptr = advancePointer(ptr, newMark, marks);
		}
	}
}

function advancePointer(ptr: Pointer, offset: number, marks: R.TraitMarks): Pointer {
	let off = offset;
	let { iMark, iNode } = ptr;
	const markMax = marks.length;
	while (off > 0 && iMark < markMax) {
		const nodeCount = markLength(marks[iMark]);
		if (iNode + off >= nodeCount) {
			iMark += 1;
			off -= nodeCount - iNode;
			iNode = 0;
		} else {
			iNode += off;
			off = 0;
		}
	}
	return { iMark, iNode };
}
