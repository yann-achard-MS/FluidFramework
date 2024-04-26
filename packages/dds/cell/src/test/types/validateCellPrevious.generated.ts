/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */

import type * as old from "@fluidframework/cell-previous";
import type * as current from "../../index.js";


// See 'build-tools/src/type-test-generator/compatibility.ts' for more information.
type TypeOnly<T> = T extends number
	? number
	: T extends string
	? string
	: T extends boolean | bigint | symbol
	? T
	: {
			[P in keyof T]: TypeOnly<T[P]>;
	  };

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ICellAttributionOptions": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ICellAttributionOptions():
    TypeOnly<old.ICellAttributionOptions>;
declare function use_current_InterfaceDeclaration_ICellAttributionOptions(
    use: TypeOnly<current.ICellAttributionOptions>): void;
use_current_InterfaceDeclaration_ICellAttributionOptions(
    get_old_InterfaceDeclaration_ICellAttributionOptions());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ICellAttributionOptions": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ICellAttributionOptions():
    TypeOnly<current.ICellAttributionOptions>;
declare function use_old_InterfaceDeclaration_ICellAttributionOptions(
    use: TypeOnly<old.ICellAttributionOptions>): void;
use_old_InterfaceDeclaration_ICellAttributionOptions(
    get_current_InterfaceDeclaration_ICellAttributionOptions());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ICellOptions": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ICellOptions():
    TypeOnly<old.ICellOptions>;
declare function use_current_InterfaceDeclaration_ICellOptions(
    use: TypeOnly<current.ICellOptions>): void;
use_current_InterfaceDeclaration_ICellOptions(
    get_old_InterfaceDeclaration_ICellOptions());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ICellOptions": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ICellOptions():
    TypeOnly<current.ICellOptions>;
declare function use_old_InterfaceDeclaration_ICellOptions(
    use: TypeOnly<old.ICellOptions>): void;
use_old_InterfaceDeclaration_ICellOptions(
    get_current_InterfaceDeclaration_ICellOptions());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISharedCell": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISharedCell():
    TypeOnly<old.ISharedCell>;
declare function use_current_InterfaceDeclaration_ISharedCell(
    use: TypeOnly<current.ISharedCell>): void;
use_current_InterfaceDeclaration_ISharedCell(
    get_old_InterfaceDeclaration_ISharedCell());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISharedCell": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISharedCell():
    TypeOnly<current.ISharedCell>;
declare function use_old_InterfaceDeclaration_ISharedCell(
    use: TypeOnly<old.ISharedCell>): void;
use_old_InterfaceDeclaration_ISharedCell(
    get_current_InterfaceDeclaration_ISharedCell());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISharedCellEvents": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISharedCellEvents():
    TypeOnly<old.ISharedCellEvents<any>>;
declare function use_current_InterfaceDeclaration_ISharedCellEvents(
    use: TypeOnly<current.ISharedCellEvents<any>>): void;
use_current_InterfaceDeclaration_ISharedCellEvents(
    get_old_InterfaceDeclaration_ISharedCellEvents());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISharedCellEvents": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISharedCellEvents():
    TypeOnly<current.ISharedCellEvents<any>>;
declare function use_old_InterfaceDeclaration_ISharedCellEvents(
    use: TypeOnly<old.ISharedCellEvents<any>>): void;
use_old_InterfaceDeclaration_ISharedCellEvents(
    get_current_InterfaceDeclaration_ISharedCellEvents());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "RemovedClassDeclaration_SharedCell": {"forwardCompat": false}
*/

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "RemovedClassDeclaration_SharedCell": {"backCompat": false}
*/
