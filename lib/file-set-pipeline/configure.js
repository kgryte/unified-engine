/**
 * @author Titus Wormer
 * @copyright 2015-2016 Titus Wormer
 * @license MIT
 * @module unified-engine:file-set-pipeline:configure
 * @fileoverview Configure a collection of files.
 */

'use strict';

/* eslint-env node */

/*
 * Dependencies.
 */

var Configuration = require('../configuration');

/**
 * Configure.
 *
 * @param {Object} context - Context object.
 * @param {Object} settings - Configuration.
 */
function configure(context, settings) {
    context.configuration = new Configuration({
        'detectConfig': settings.detectConfig,
        'rcName': settings.rcName,
        'rcPath': settings.rcPath,
        'packageField': settings.packageField,
        'settings': settings.settings,
        'plugins': settings.plugins,
        'output': settings.output,
        'cwd': settings.cwd
    });
}

/*
 * Expose.
 */

module.exports = configure;