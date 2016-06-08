/**
 * @author Titus Wormer
 * @copyright 2015-2016 Titus Wormer
 * @license MIT
 * @module unified-engine:configuration
 * @fileoverview Find rc files.
 */

'use strict';

/* eslint-env node */

/*
 * Dependencies.
 */

var fs = require('fs');
var path = require('path');
var debug = require('debug')('unified-engine:configuration');
var home = require('user-home');
var findUp = require('vfile-find-up');

/*
 * Constants.
 */

var PACKAGE_NAME = 'package';
var PACKAGE_EXTENSION = 'json';
var PACKAGE_FILENAME = [PACKAGE_NAME, PACKAGE_EXTENSION].join('.');
var MODULE_EXTENSION = 'js';
var PLUGIN_KEY = 'plugins';

/*
 * Methods.
 */

var read = fs.readFileSync;
var exists = fs.existsSync;
var resolve = path.resolve;
var dirname = path.dirname;
var extname = path.extname;
var concat = Array.prototype.concat;

/**
 * Merge two configurations, `configuration` into
 * `target`.
 *
 * @param {Object} target - Configuration to merge into.
 * @param {Object} configuration - Configuration to merge
 *   from.
 * @param {boolean} [recursive] - Used internally no ensure
 *   the plug-in key is only escaped at root-level.
 * @return {Object} - `target`.
 */
function merge(target, configuration, recursive) {
    var key;
    var value;
    var index;
    var length;
    var result;
    var plugin;

    for (key in configuration) {
        value = configuration[key];
        result = target[key];

        if (key === PLUGIN_KEY && !recursive) {
            if (!result) {
                target[key] = result = {};
            }

            if ('length' in value) {
                index = -1;
                length = value.length;

                while (++index < length) {
                    plugin = value[index];

                    if (!(plugin in result)) {
                        result[plugin] = {};
                    }
                }
            } else {
                for (plugin in value) {
                    if (value[plugin] === false) {
                        result[plugin] = false
                    } else {
                        result[plugin] = merge(
                            result[plugin] || {},
                            value[plugin] || {},
                            true
                        );
                    }
                }
            }
        } else if (typeof value === 'object' && value !== null) {
            if ('length' in value) {
                target[key] = concat.apply(value);
            } else {
                target[key] = merge(result || {}, value, true);
            }
        } else if (value !== undefined) {
            target[key] = value;
        }
    }

    return target;
}

/**
 * Parse a JSON configuration object from a file.
 *
 * @throws {Error} - Throws when `filePath` is not found.
 * @param {string} filePath - File location.
 * @return {Object} - Parsed JSON.
 */
function load(filePath) {
    var configuration = {};

    try {
        if (extname(filePath).slice(1) === MODULE_EXTENSION) {
            configuration = require(filePath);
        } else {
            configuration = JSON.parse(read(filePath, 'utf8'));
        }
    } catch (err) {
        err.message = 'Cannot read configuration file: ' +
            filePath + '\n' + err.message;

        throw err;
    }

    return configuration;
}

/**
 * Get personal configuration object from `~`.
 * Loads `rcName` and `rcName.js`.
 *
 * @param {string?} rcName - Name of configuration file.
 * @return {Object} - Parsed JSON.
 */
function getUserConfiguration(rcName) {
    var configuration = {};

    /**
     * Load one file-path.
     *
     * @param {string} filePath - Location of config file.
     */
    function loadOne(filePath) {
        /* istanbul ignore next - not really testable
         * as this loads files outside this project. */
        if (exists(filePath)) {
            merge(configuration, load(filePath));
        }
    }

    /* istanbul ignore next - not really testable. */
    if (home) {
        loadOne(path.join(home, rcName));
        loadOne(path.join(home, [rcName, MODULE_EXTENSION].join('.')));
    }

    return configuration;
}

/**
 * Get a local configuration object, by walking from
 * `directory` upwards and merging all configurations.
 * If no configuration was found by walking upwards, the
 * current user's config (at `~`) is used.
 *
 * @param {Configuration} context - Configuration object to use.
 * @param {string} directory - Location to search.
 * @param {Function} callback - Invoked with `files`.
 */
function getLocalConfiguration(context, directory, callback) {
    var rcName = context.settings.rcName;
    var packageField = context.settings.packageField;
    var search = [];

    if (rcName) {
        debug('Looking for `%s` configuration files', rcName);
        search.push(rcName, [rcName, MODULE_EXTENSION].join('.'));
    }

    if (packageField) {
        search.push(PACKAGE_FILENAME);
        debug('Looking for `%s` fields in `package.json` files', packageField);
    }

    if (!search.length || !context.settings.detectConfig) {
        debug('Not looking for configuration files');
        callback(null, {});
        return;
    }

    findUp.all(search, directory, function (err, files) {
        var configuration = {};
        var index = files && files.length;
        var file;
        var local;
        var found;

        while (index--) {
            file = files[index];

            try {
                local = load(file.filePath());
            } catch (err) {
                callback(err);
                return;
            }

            if (
                file.filename === PACKAGE_NAME &&
                file.extension === PACKAGE_EXTENSION
            ) {
                if (packageField in local) {
                    local = local[packageField];
                } else {
                    continue;
                }
            }

            found = true;

            debug('Using ' + file.filePath());

            merge(configuration, local);
        }

        if (!found) {
            debug('Using personal configuration');

            merge(configuration, getUserConfiguration(rcName));
        }

        callback(err, configuration);
    });
}

/**
 * Configuration.
 *
 * @constructor
 * @class Configuration
 * @param {Object} settings - Options to be passed in.
 */
function Configuration(settings) {
    var self = this;
    var rcPath = settings.rcPath;
    var rcFile = {};

    self.settings = settings;
    self.cache = {};

    if (rcPath) {
        debug('Using command line configuration `' + rcPath + '`');

        rcFile = load(resolve(settings.cwd, rcPath));
    }

    self.rcFile = rcFile;
}

/**
 * Build a configuration object.
 *
 * @param {string} filePath - File location.
 * @param {Function} callback - Callback invoked with
 *   configuration.
 */
Configuration.prototype.getConfiguration = function (filePath, callback) {
    var self = this;
    var cwd = self.settings.cwd;
    var directory = dirname(resolve(cwd, filePath));
    var configuration = self.cache[directory];

    debug('Constructing configuration for `' + filePath + '`');

    /**
     * Check if `value` is a list of callbacks.
     *
     * @param {*} value - Value to check.
     * @return {boolean} - Whether `value` is a list of
     *   callbacks.
     */
    function callbacks(value) {
        return value && value.length && typeof value[0] === 'function';
    }

    /**
     * Handle (possible) local config result.
     *
     * @param {Error?} [err] - Loading error.
     * @param {Object?} [localConfiguration] - Configuration.
     */
    function handleLocalConfiguration(err, localConfiguration) {
        var current = self.cache[directory];

        if (localConfiguration) {
            merge(configuration, localConfiguration);
        }

        merge(configuration, self.rcFile);

        merge(configuration, {
            'settings': self.settings.settings,
            'plugins': self.settings.plugins,
            'output': self.settings.output
        });

        self.cache[directory] = configuration;

        current.forEach(function (callback) {
            callback(err, configuration);
        });
    }

    /* List of callbacks. */
    if (configuration && callbacks(configuration)) {
        configuration.push(callback);
        return;
    }

    /* istanbul ignore next - only occurs if many files are
     * checked, which is hard to reproduce. */
    if (configuration) {
        debug('Using configuration from cache');
        callback(null, configuration);
        return;
    }

    self.cache[directory] = [callback];
    configuration = {};
    getLocalConfiguration(self, directory, handleLocalConfiguration);
};

/*
 * Expose.
 */

module.exports = Configuration;