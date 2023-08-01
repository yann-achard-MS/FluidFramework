/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Attach,
	CellId,
	Delete,
	Detach,
	Effect,
	Insert,
	Mark,
	MoveIn,
	MoveOut,
	MovePlaceholder,
	NewAttach,
	Reattach,
	ReturnFrom,
	ReturnTo,
	Revive,
	Transient,
} from "./format";

/**
 * A mark which extends `CellTargetingMark`.
 */
export type ExistingCellMark<TNodeChange> =
	| NoopMark
	| ModifyMark<TNodeChange>
	| MovePlaceholderMark<TNodeChange>
	| DeleteMark<TNodeChange>
	| MoveOutMark<TNodeChange>
	| ReturnFromMark<TNodeChange>
	| ModifyMark<TNodeChange>
	| ReviveMark<TNodeChange>
	| ReturnToMark;

export type EmptyInputCellMark<TNodeChange> = Mark<TNodeChange> & { cellId: CellId };

/**
 * A mark that spans one or more cells.
 * The spanned cells may be populated (e.g., "Delete") or not (e.g., "Revive").
 */
export type CellSpanningMark<TNodeChange> = Exclude<Mark<TNodeChange>, NewAttachMark<TNodeChange>>;

export type Generate = Insert | Revive;

export type TransientGenerate = Generate & Transient;

export type EmptyOutputCellMark = TransientGenerate | Detach;

export type TransientMark<TNodeChange> = GenerateMark<TNodeChange> & Transient;

export type EffectMark<
	TEffect extends Effect | undefined,
	TNodeChange = unknown,
> = Mark<TNodeChange> & {
	effects: [TEffect];
};

export type Move = MoveOut | MoveIn | ReturnFrom | ReturnTo;

export type ModifyMark<TNodeChange> = Mark<TNodeChange> & {
	changes: TNodeChange;
	effects?: never;
};

export type GenerateMark<TNodeChange> = EffectMark<Generate, TNodeChange>;
export type TransientGenerateMark<TNodeChange> = EffectMark<TransientGenerate, TNodeChange>;
export type NewAttachMark<TNodeChange> = EffectMark<NewAttach, TNodeChange>;
export type InsertMark<TNodeChange> = EffectMark<Insert, TNodeChange>;
export type AttachMark<TNodeChange> = EffectMark<Attach, TNodeChange>;
export type MoveInMark = EffectMark<MoveIn, undefined>;
export type MoveMark<TNodeChange> = EffectMark<Move, TNodeChange>;
export type DetachMark<TNodeChange> = EffectMark<Detach, TNodeChange>;
export type ReattachMark<TNodeChange> = EffectMark<Reattach, TNodeChange>;
export type ReturnToMark = EffectMark<ReturnTo, undefined>;
export type DeleteMark<TNodeChange> = EffectMark<Delete, TNodeChange>;
export type ReviveMark<TNodeChange> = EffectMark<Revive, TNodeChange>;
export type MovePlaceholderMark<TNodeChange> = EffectMark<MovePlaceholder, TNodeChange>;
export type MoveOutMark<TNodeChange> = EffectMark<MoveOut, TNodeChange>;
export type ReturnFromMark<TNodeChange> = EffectMark<ReturnFrom, TNodeChange>;
export type NoopMark = Mark<never> & { effect?: never };
