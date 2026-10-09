/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	debugAssert,
	nonProductionConditionalsIncluded,
} from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * The levels of modular change validation that can be {@link ModularChangeValidation | configured}.
 * @alpha
 */
export enum ModularChangeValidationLevel {
	/** No modular change validation is performed. */
	None = 0,
	/** Basic modular change validation is performed, with minimal performance overhead. */
	Basic = 1,
	/** Full modular change validation is performed, with the highest level of scrutiny and potential performance overhead. */
	Full = 2,
}

/**
 * The entry point for configuring and querying the status of modular change validation.
 * @alpha
 */
export interface ModularChangeValidationAlpha {
	/**
	 * The current level of modular change validation.
	 * Configurable via {@link ModularChangeValidationAlpha.setLevel}.
	 */
	readonly currentLevel: ModularChangeValidationLevel;

	/**
	 * The levels of modular change validation that can be {@link ModularChangeValidationAlpha.setLevel | set}.
	 */
	readonly Level: {
		/** No modular change validation is performed. */
		readonly None: ModularChangeValidationLevel.None;
		/** Basic modular change validation is performed, with minimal performance overhead. */
		readonly Basic: ModularChangeValidationLevel.Basic;
		/** Full modular change validation is performed, with the highest level of scrutiny and potential performance overhead. */
		readonly Full: ModularChangeValidationLevel.Full;
	};

	/**
	 * Sets the desired level of modular change validation for modular change instances.
	 * This can be used in debug builds to assist in root cause analysis of Fluid Framework bugs.
	 * @param level - The desired level of modular change validation.
	 * @returns The previous level in effect immediately before this call.
	 * @throws for levels higher than `None` if {@link @fluidframework/core-utils#debugAssert} calls have been optimized out.
	 *
	 * @remarks
	 * The default validation level is `Basic`.
	 */
	readonly setLevel: (level: ModularChangeValidationLevel) => ModularChangeValidationLevel;

	/**
	 * Sets the desired level of modular change validation for modular change instances for the duration of the provided callback.
	 * This can be used in debug builds to assist in root cause analysis of Fluid Framework bugs.
	 * @param level - The desired level of modular change validation.
	 * @param callback - The function to execute while the specified validation level is in effect.
	 * @returns the value returned by the callback function (if any).
	 * @throws for levels higher than `None` if {@link @fluidframework/core-utils#debugAssert} calls have been optimized out.
	 *
	 * @remarks
	 * The default validation level is `Basic`.
	 */
	readonly runWithLevel: <TOut>(
		level: ModularChangeValidationLevel,
		callback: () => TOut,
	) => TOut;
}

/**
 * Indicates whether modular change validation is currently enabled.
 * See {@link ModularChangeValidationAlpha.setLevel} for more information.
 */
let modularChangeValidationLevel = ModularChangeValidationLevel.Basic;

/**
 * The entry point for configuring and querying the status of modular change validation.
 * @alpha
 */
export const ModularChangeValidation: ModularChangeValidationAlpha = {
	get currentLevel(): ModularChangeValidationLevel {
		return modularChangeValidationLevel;
	},
	Level: {
		None: ModularChangeValidationLevel.None,
		Basic: ModularChangeValidationLevel.Basic,
		Full: ModularChangeValidationLevel.Full,
	},
	setLevel: (level: ModularChangeValidationLevel): ModularChangeValidationLevel => {
		if (level !== ModularChangeValidationLevel.None && !nonProductionConditionalsIncluded()) {
			throw new UsageError(
				"Modular change validation cannot be enabled because debug asserts have been optimized out",
			);
		}
		const old = modularChangeValidationLevel;
		modularChangeValidationLevel = level;
		return old;
	},
	runWithLevel: <TOut>(level: ModularChangeValidationLevel, callback: () => TOut): TOut => {
		const old = ModularChangeValidation.setLevel(level);
		try {
			return callback();
		} finally {
			modularChangeValidationLevel = old;
		}
	},
};

export function basicValidation(predicate: () => true | string): void {
	debugAssert(() =>
		ModularChangeValidation.currentLevel >= ModularChangeValidationLevel.Basic
			? predicate()
			: true,
	);
}

export function fullValidation(predicate: () => true | string): void {
	debugAssert(() =>
		ModularChangeValidation.currentLevel === ModularChangeValidationLevel.Full
			? predicate()
			: true,
	);
}

// The `no-console` rule is enabled (for the remainder of this file only) so that lint fails if the lines below are left uncommented.
/* eslint no-console: "error" -- Guards against inadvertently committing the call below. */
// Uncomment the next three lines to enable modular change validation for debugging purposes.
// console.debug(
// 	`Modular change validation changed from ${ModularChangeValidation.setLevel(ModularChangeValidationLevel.Full)} to ${ModularChangeValidationLevel.Full}`,
// );
