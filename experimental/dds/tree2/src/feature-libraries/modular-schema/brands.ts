/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand } from "../../util";
import { AnchorSetAspects } from "./anchorSetOps";
import { FieldChangeHandler } from "./fieldChangeHandler";
import { FieldKindWithEditor, Multiplicity } from "./fieldKind";

/**
 * @alpha
 */
export type ModularFieldChangeset = Brand<unknown, "ModularFieldChangeset">;

export type ModularFieldNodeKey = Brand<unknown, "ModularFieldNodeKey">;

export class Container<TData> {
	protected readonly data?: TData;

	/**
	 * This class should never exist at runtime, so make it un-constructable.
	 */
	private constructor() {}
}

export type ModularFieldAnchorContainer<TData> = Brand<unknown, "ModularFieldAnchorContainer"> &
	Container<TData>;

export const ModularAnchorSetOpsURI = "ModularAnchorSetOpsURI";
export type ModularAnchorSetOps<TData> = AnchorSetAspects<
	ModularFieldAnchorContainer<TData>,
	ModularFieldNodeKey,
	ModularFieldChangeset
>;

// Registers ModularAnchorSetOps as a concrete implementation of the FieldAnchorSetOps concern
declare module "./anchorSetOps/anchorSetOpsRegistry" {
	interface AnchorSetOpsRegistry<TData> {
		[ModularAnchorSetOpsURI]: ModularAnchorSetOps<TData>;
	}
}

/**
 * This type narrows the type of dependent types so that instead of simply being `unknown`,
 * which makes all the dependent types interchangeable, the dependent types are instead branded `unknown` types.
 * This doesn't reveal/assume anything specific about the dependent types, but it does make them different.
 * This prevents passing, e.g., passing a changeset when an anchor key is expected.
 */
export type ModularFieldKind = FieldKindWithEditor<
	unknown,
	Multiplicity,
	string,
	typeof ModularAnchorSetOpsURI
>;

export type ModularFieldChangeHandler = FieldChangeHandler<typeof ModularAnchorSetOpsURI>;
