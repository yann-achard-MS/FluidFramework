/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../util";
import { Skip, Transposed as T } from "./format";

export function isAttachGroup(mark: T.Mark): mark is T.AttachGroup {
    return Array.isArray(mark);
}

export function isReattach(mark: T.Mark): mark is T.Reattach {
    return isObjMark(mark) && "type" in mark && (mark.type === "Revive" || mark.type === "Return");
}

export function getAttachLength(attach: T.Attach): number {
    const type = attach.type;
    switch (type) {
        case "Bounce":
        case "Intake":
            return 0;
        case "MInsert":
        case "MMoveIn":
            return 1;
        case "Insert":
            return attach.content.length;
        case "MoveIn":
            return attach.count;
        default: unreachableCase(type);
    }
}

/**
 * @returns `true` iff `lhs` and `rhs` are deeply structurally equal.
 */
export function isEqualGaps(lhs: T.GapEffect[] | undefined, rhs: T.GapEffect[] | undefined): boolean {
    if (lhs === rhs) {
        return true;
    }
    if (lhs === undefined || rhs === undefined || lhs.length !== rhs.length) {
        return false;
    }
    for (let i = 0; i < lhs.length; ++i) {
        if (!isEqualGapEffect(lhs[i], rhs[i])) {
            return false;
        }
    }
    return true;
}

export function isEqualGapEffect(lhs: Readonly<T.GapEffect>, rhs: Readonly<T.GapEffect>): boolean {
    return lhs.id === rhs.id
        && lhs.type === rhs.type
        && lhs.excludePriorInsertions === rhs.excludePriorInsertions
        && lhs.includePosteriorInsertions === rhs.includePosteriorInsertions;
}

export function getMarkLength(mark: T.Mark): number {
    if (isSkipMark(mark)) {
        return mark;
    }
    if (isAttachGroup(mark)) {
        return mark.reduce((prev, attach) => prev + getAttachLength(attach), 0);
    }
    const type = mark.type;
    switch (type) {
        case "Modify":
        case "MDelete":
        case "MMoveOut":
        case "MReturn":
        case "MRevive":
            return 1;
        case "Delete":
        case "MoveOut":
        case "Return":
        case "Revive":
        case "Tomb":
        case "Gap":
            return mark.count;
        default: unreachableCase(type);
    }
}

export function isSkipMark(mark: T.Mark): mark is Skip {
    return typeof mark === "number";
}

export function splitMark<TMark extends T.Mark>(mark: TMark, length: number): [TMark, TMark] {
    const markLength = getMarkLength(mark);
    const remainder = markLength - length;
    if (length < 1 || markLength <= length) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    if (typeof mark === "number") {
        return [length, remainder] as [TMark, TMark];
    }
    if (isAttachGroup(mark)) {
        return splitAttachGroup(mark, length) as [TMark, TMark];
    }
    const markObj = mark as T.SizedObjectMark;
    const type = markObj.type;
    switch (type) {
        case "Modify":
        case "MDelete":
        case "MMoveOut":
        case "MReturn":
        case "MRevive":
            fail(`Unable to split ${type} mark`);
        case "Delete":
        case "MoveOut":
        case "Return":
        case "Revive":
        case "Tomb":
        case "Gap":
            return [{ ...markObj, count: length }, { ...markObj, count: remainder }] as [TMark, TMark];
        default: unreachableCase(type);
    }
}

function splitAttachGroup<TAttach extends T.Attach>(mark: TAttach[], length: number): [TAttach[], TAttach[]] {
    const groupA: TAttach[] = [];
    const groupB: TAttach[] = [...mark];
    let left = length;
    while (left > 0) {
        const attach = groupB.shift();
        if (attach === undefined) {
            fail("Discrepancy between getMarkLength and splitMark");
        }
        const len = getAttachLength(attach);
        if (len <= left) {
            groupA.push(attach);
            left -= len;
        } else {
            const [partA, partB] = splitAttachMark(attach, left);
            groupA.push(partA);
            groupB.unshift(partB);
            left = 0;
        }
    }
    return [groupA, groupB];
}

function splitAttachMark<TAttach extends T.Attach>(attach: TAttach, length: number): [TAttach, TAttach] {
    const markLength = getAttachLength(attach);
    const remainder = markLength - length;
    if (length < 1 || markLength <= length) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    const type = attach.type;
    switch (type) {
        case "Bounce":
        case "Intake":
        case "MInsert":
        case "MMoveIn":
            fail("Unable to split mark");
        case "Insert":
            return [
                { ...attach, content: attach.content.slice(0, length) },
                { ...attach, content: attach.content.slice(length) },
            ];
        case "MoveIn":
            return [
                { ...attach, count: length },
                { ...attach, count: remainder },
            ];
        default: unreachableCase(type);
    }
}

export function isDetachMark(mark: T.Mark | undefined): mark is T.Detach | T.ModifyDetach {
    if (isObjMark(mark) && "type" in mark) {
        const type = mark.type;
        return type === "Delete" || type === "MDelete" || type === "MoveOut" || type === "MMoveOut";
    }
    return false;
}

export function isObjMark(mark: T.Mark | undefined): mark is T.ObjectMark {
    return typeof mark === "object";
}

/**
 * Appends the contents of the `addendum` to the `group`.
 * @param group - The attach group to append attach marks to. Is mutated by this function.
 * @param addendum - The array of attach marks to append. Is not mutated by this function.
 */
export function extendAttachGroup(group: T.AttachGroup, addendum: T.AttachGroup): void {
    const lastLeft = group[group.length - 1];
    const firstRight = addendum[0];
    if (lastLeft !== undefined
        && firstRight !== undefined
        && lastLeft.type === firstRight.type
        && lastLeft.id === firstRight.id) {
        const type = lastLeft.type;
        switch (type) {
            case "Insert":
            case "MoveIn": {
                const firstRightAttach = firstRight as T.Insert | T.MoveIn;
                if (lastLeft.heed === firstRightAttach.heed
                    && lastLeft.tiebreak === firstRightAttach.tiebreak
                    && lastLeft.src?.id === firstRightAttach.src?.id
                    && lastLeft.src?.change === firstRightAttach.src?.change
                    && lastLeft.scorch?.id === firstRightAttach.scorch?.id
                    && lastLeft.scorch?.change === firstRightAttach.scorch?.change) {
                    if (lastLeft.type === "Insert") {
                        const firstRightInsert = firstRight as T.Insert;
                        lastLeft.content.push(...firstRightInsert.content);
                    } else {
                        const firstRightMoveIn = firstRight as T.MoveIn;
                        lastLeft.count += firstRightMoveIn.count;
                    }
                    group.push(...addendum.slice(1));
                    return;
                }
                break;
            }
            default: break;
        }
    }
    group.push(...addendum);
}

/**
 * Attempts to extend `lhs` to include the effects of `rhs`.
 * @param lhs - The mark to extend.
 * @param rhs - The effect so extend `rhs` with.
 * @returns `true` iff the function was able to mutate `lhs` to include the effects of `rhs`.
 * When `false` is returned, `lhs` is left untouched.
 */
export function tryExtendMark(lhs: T.SizedObjectMark, rhs: Readonly<T.SizedObjectMark>): boolean {
    if (rhs.type !== lhs.type) {
        return false;
    }
    const type = rhs.type;
    switch (type) {
        case "Delete":
        case "MoveOut": {
            const lhsDetach = lhs as T.Detach;
            if (
                rhs.id === lhsDetach.id
                && rhs.tomb === lhsDetach.tomb
                && isEqualGaps(rhs.gaps, lhsDetach.gaps)
            ) {
                lhsDetach.count += rhs.count;
                return true;
            }
            break;
        }
        case "Revive":
        case "Return": {
            const lhsReattach = lhs as T.Reattach;
            if (
                rhs.id === lhsReattach.id
                && rhs.tomb === lhsReattach.tomb
            ) {
                lhsReattach.count += rhs.count;
                return true;
            }
            break;
        }
        case "Gap": {
            const lhsGap = lhs as T.GapEffectSegment;
            if (
                rhs.tomb === lhsGap.tomb
                && isEqualGaps(rhs.stack, lhsGap.stack)
            ) {
                lhsGap.count += rhs.count;
                return true;
            }
            break;
        }
        case "Tomb": {
            const lhsTomb = lhs as T.Tomb;
            if (rhs.change === lhsTomb.change) {
                lhsTomb.count += rhs.count;
                return true;
            }
            break;
        }
        default: break;
    }
    return false;
}
