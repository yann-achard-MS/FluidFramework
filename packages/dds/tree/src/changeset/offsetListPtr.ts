/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OffsetList } from "../changeset";
import { fail } from "../util";

export interface ContentPolicy<TContent> {
    getLength(content: TContent): number;
    split(content: TContent, offset: number): [TContent, TContent];
}

export const unaryContentPolicy = {
    getLength: (): number => 1,
    split: (): never => fail("Length 1 content cannot be split"),
};

export interface HasCount {
    readonly count: number;
}

export const contentWithCountPolicy = {
    getLength: (content: HasCount): number => content.count,
    split: <TContent extends HasCount>(content: TContent, offset: number): [TContent, TContent] =>
    [{ ...content, count: offset }, { ...content, count: content.count - offset }],
};

export interface Visitor<TContent extends Exclude<unknown, number>> {
    readonly onOverflow?: (count: number) => void;
    readonly onTraverse?: (startOffset: number, count: number, element: number | TContent) => void;
}

export function offsetSumVisitorFactory(): Visitor<unknown> & { sum: number; } {
    const visitor = {
        sum: 0,
        onOverflow: (count: number) => { visitor.sum += count; },
        onTraverse: (_: number, count: number, element: unknown) => {
            if (typeof element === "number") {
                visitor.sum += count;
            }
        },
    };
    return visitor;
}

export class OffsetListPtr<TContent extends Exclude<unknown, number>> {
    private readonly list: OffsetList<TContent>;
    private readonly contentPolicy: ContentPolicy<TContent>;
    private readonly listIdx: number;
    private readonly realIdx: number;
    private readonly realOffset: number;

    private constructor(
        list: OffsetList<TContent>,
        contentPolicy: ContentPolicy<TContent>,
        listIdx: number,
        realIdx: number,
        realOffset: number,
    ) {
        this.list = list;
        this.listIdx = listIdx;
        this.realIdx = realIdx;
        this.realOffset = realOffset;
        this.contentPolicy = contentPolicy;
    }

    public static from<TContent extends Exclude<unknown, number>>(
        list: OffsetList<TContent>,
        contentPolicy: ContentPolicy<TContent>,
    ): OffsetListPtr<TContent> {
        return new OffsetListPtr(list, contentPolicy, 0, 0, 0);
    }

    private getLength(elem: TContent | number | undefined): number | undefined {
        if (elem === undefined) {
            return undefined;
        }
        if (typeof elem === "number") {
            return elem;
        }
        return this.contentPolicy.getLength(elem);
    }

    public fwd(offset: number, visitor?: Visitor<TContent>): OffsetListPtr<TContent> {
        let realOffset = this.realOffset;
        let listIdx = this.listIdx;
        let toSkip = offset;
        while (toSkip > 0) {
            const elem = this.list[listIdx];
            const len = this.getLength(elem);
            if (len === undefined) {
                visitor?.onOverflow?.(toSkip);
                realOffset += toSkip;
                toSkip = 0;
            } else {
                if (toSkip > len - realOffset) {
                    visitor?.onTraverse?.(realOffset, len - realOffset, elem);
                    toSkip -= len - realOffset;
                    listIdx += 1;
                    realOffset = 0;
                } else {
                    visitor?.onTraverse?.(realOffset, toSkip, elem);
                    realOffset += toSkip;
                    toSkip = 0;
                }
            }
        }
        return new OffsetListPtr(this.list, this.contentPolicy, listIdx, this.realIdx + offset, realOffset);
    }

    public addMark(mark: TContent): OffsetListPtr<TContent> {
        const elem = this.list[this.listIdx];
        if (elem === undefined) {
            if (this.realOffset > 0) {
                this.list.push(this.realOffset);
            }
            this.list.push(mark);
        } else if (typeof elem === "number") {
            if (elem === this.realOffset) {
                this.list.push(mark);
            } else if (elem > this.realOffset) {
                this.list.splice(this.listIdx, 1, this.realOffset, mark, elem - this.realOffset);
            } else {
                fail("The ptr offset in the offset element cannot be greater than the length of the element");
            }
        } else {
            const elemLength = this.contentPolicy.getLength(elem);
            if (this.realOffset === 0) {
                this.list.splice(this.listIdx, 0, mark);
            } else if (this.realOffset === elemLength) {
                this.list.splice(this.listIdx + 1, 0, mark);
            } else {
                const [part1, part2] = this.contentPolicy.split(elem, this.realOffset);
                this.list.splice(this.listIdx, 1, part1, mark, part2);
            }
        }
        return this.fwd(this.contentPolicy.getLength(mark));
    }

    public addOffset(offset: number): OffsetListPtr<TContent> {
        if (offset === 0) {
            return this;
        }
        const elem = this.list[this.listIdx];
        if (elem === undefined) {
            this.list.push(offset + this.realOffset);
        } else if (typeof elem === "number") {
            this.list[this.listIdx] = elem + offset;
        } else {
            this.list.splice(this.listIdx, 0, offset);
        }
        return this.fwd(offset);
    }

    private split(): void {
        throw new Error("Not implemented");
    }

    public splice(deleteCount: number, replacement?: OffsetList<TContent>): OffsetList<TContent> {
        this.split();
        const to = this.fwd(deleteCount);
        to.split();
        const listItemsCount = to.listIdx - this.listIdx;
        const out = this.list.splice(this.listIdx, listItemsCount, ...(replacement ?? []));
        return out;
    }
}
