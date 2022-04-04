/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-validator in @fluidframework/build-tools.
 */
/* eslint-disable max-lines */
import * as old from "@fluidframework/routerlicious-host-previous";
import * as current from "../../index";

type TypeOnly<T> = {
    [P in keyof T]: TypeOnly<T[P]>;
};

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2000:
* "ClassDeclaration_ContainerUrlResolver": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_ContainerUrlResolver():
    TypeOnly<old.ContainerUrlResolver>;
declare function use_current_ClassDeclaration_ContainerUrlResolver(
    use: TypeOnly<current.ContainerUrlResolver>);
use_current_ClassDeclaration_ContainerUrlResolver(
    get_old_ClassDeclaration_ContainerUrlResolver());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken.0.58.2000:
* "ClassDeclaration_ContainerUrlResolver": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_ContainerUrlResolver():
    TypeOnly<current.ContainerUrlResolver>;
declare function use_old_ClassDeclaration_ContainerUrlResolver(
    use: TypeOnly<old.ContainerUrlResolver>);
use_old_ClassDeclaration_ContainerUrlResolver(
    get_current_ClassDeclaration_ContainerUrlResolver());
