/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { IdAllocator } from "../modular-schema";
import { InputSpanningMark, Mark } from "./format";
import {
	applyMoveEffectsToMark,
	MoveEffectTable,
	splitMarkOnInput,
	splitMarkOnOutput,
} from "./moveEffectTable";
import { isBlockedReattach, isInputSpanningMark, isOutputSpanningMark } from "./utils";

export class MarkQueue {
	private readonly stack: Mark[] = [];
	private index = 0;

	public constructor(
		private readonly list: readonly Mark[],
		public readonly revision: RevisionTag | undefined,
		private readonly moveEffects: MoveEffectTable,
		private readonly consumeEffects: boolean,
		private readonly genId: IdAllocator,
	) {
		this.list = list;
	}

	public isEmpty(): boolean {
		return this.peek() === undefined;
	}

	public dequeue(): Mark {
		const output = this.tryDequeue();
		assert(output !== undefined, 0x4e2 /* Unexpected end of mark queue */);
		return output;
	}

	public tryDequeue(): Mark | undefined {
		if (this.stack.length > 0) {
			return this.stack.pop();
		} else if (this.index < this.list.length) {
			const mark = this.list[this.index++];
			if (mark === undefined) {
				return undefined;
			}

			const splitMarks = applyMoveEffectsToMark(
				mark,
				this.revision,
				this.moveEffects,
				this.consumeEffects,
			);

			if (splitMarks.length === 0) {
				return undefined;
			}

			const result = splitMarks[0];
			for (let i = splitMarks.length - 1; i > 0; i--) {
				this.stack.push(splitMarks[i]);
			}
			return result;
		}
	}

	/**
	 * Dequeues the first `length` sized portion of the next mark.
	 * The caller must verify that the next mark (as returned by peek) is longer than this length.
	 * @param length - The length to dequeue, measured in the input context.
	 */
	public dequeueInput(length: number): InputSpanningMark {
		const mark = this.dequeue();
		assert(isInputSpanningMark(mark), 0x4e3 /* Can only split sized marks on input */);
		const [mark1, mark2] = splitMarkOnInput(
			mark,
			this.revision,
			length,
			this.genId,
			this.moveEffects,
			!this.consumeEffects,
		);
		this.stack.push(mark2);
		return mark1;
	}

	/**
	 * Dequeues the first `length` sized portion of the next mark.
	 * The caller must verify that the next mark (as returned by peek) is longer than this length.
	 * @param length - The length to dequeue, measured in the output context.
	 * @param includeBlockedCells - If true, blocked marks that target empty cells will note be treated as 0-length.
	 */
	public dequeueOutput(length: number, includeBlockedCells: boolean = false): Mark {
		const mark = this.dequeue();
		assert(
			isOutputSpanningMark(mark) || (includeBlockedCells && isBlockedReattach(mark)),
			0x4e4 /* Should only dequeue output if the next mark has output length > 0 */,
		);
		const [mark1, mark2] = splitMarkOnOutput(
			mark,
			this.revision,
			length,
			this.genId,
			this.moveEffects,
			!this.consumeEffects,
		);
		this.stack.push(mark2);
		return mark1;
	}

	public peek(): Mark | undefined {
		const mark = this.tryDequeue();
		if (mark !== undefined) {
			this.stack.push(mark);
		}
		return mark;
	}
}
