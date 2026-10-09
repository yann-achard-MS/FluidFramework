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
 * The entry point for configuring and querying the status of modular change validation.
 * @alpha
 */
export interface ModularChangeValidationAlpha {
	/**
	 * Indicates whether modular change validation is currently enabled.
	 * See {@link configureModularChangeValidation} for more information.
	 */
	readonly isEnabled: boolean;

	/**
	 * Toggles aggressive validation of modular change instances.
	 * This can be used in debug builds to assist in root cause analysis of Fluid Framework bugs.
	 * @param enable - Whether to enable (`true`) or disable (`false`) modular change validation.
	 * @throws when enabling if {@link debugAssert} calls have been optimized out.
	 *
	 * @remarks
	 * The validation defaults to disabled.
	 * Enabling this validation can cause performance degradations.
	 *
	 * @returns `true` if modular change validation was enabled immediately before this call, `false` otherwise.
	 */
	readonly configure: (enable: boolean) => boolean;
	/**
	 * Toggles aggressive validation of modular change instances for the duration of the provided callback.
	 * This can be used in debug builds to assist in root cause analysis of Fluid Framework bugs.
	 * @param enable - Whether to enable (`true`) or disable (`false`) modular change validation.
	 * @param callback - The function to execute while the specified validation setting is in effect.
	 * @throws when enabling if {@link debugAssert} calls have been optimized out.
	 *
	 * @remarks
	 * The validation defaults to disabled.
	 * Enabling this validation can cause performance degradations.
	 *
	 * @returns the value returned by the callback function (if any).
	 */
	readonly configureInScope: <TOut>(enable: boolean, callback: () => TOut) => TOut;
}

/**
 * Indicates whether modular change validation is currently enabled.
 * See {@link ModularChangeValidationAlpha.configure} for more information.
 */
let modularChangeValidationEnabled = false;

/**
 * The entry point for configuring and querying the status of modular change validation.
 * @alpha
 */
export const ModularChangeValidation: ModularChangeValidationAlpha = {
	get isEnabled(): boolean {
		return modularChangeValidationEnabled;
	},
	configure: (enable: boolean): boolean => {
		if (enable && !nonProductionConditionalsIncluded()) {
			throw new UsageError(
				"Modular change validation cannot be enabled because debug asserts have been optimized out",
			);
		}
		const old = modularChangeValidationEnabled;
		modularChangeValidationEnabled = enable;
		return old;
	},
	configureInScope: <TOut>(enable: boolean, callback: () => TOut): TOut => {
		const old = ModularChangeValidation.configure(enable);
		try {
			return callback();
		} finally {
			ModularChangeValidation.configure(old);
		}
	},
};

export function conditionalValidation(predicate: () => true | string): void {
	debugAssert(() => (ModularChangeValidation.isEnabled ? predicate() : true));
}

// The `no-console` rule is enabled (for this file only) so that lint fails if the line below is left uncommented.
/* eslint no-console: "error" -- Guards against inadvertently committing the call below. */

// Uncomment the next three lines to enable modular change validation for debugging purposes.
// console.debug(
// 	`Modular change validation statically toggled from ${ModularChangeValidation.configure(true) ? "enabled" : "disabled"} to enabled`,
// );
