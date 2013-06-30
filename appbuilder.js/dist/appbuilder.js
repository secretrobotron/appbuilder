
/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.6 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.6',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && navigator && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value !== 'string') {
                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite and existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; ary[i]; i += 1) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
                        //path segment at the front so it can be mapped
                        //correctly to disk. Otherwise, there is likely
                        //no path mapping for a path starting with '..'.
                        //This can still fail, but catches the most reasonable
                        //uses of ..
                        break;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgName, pkgConfig, mapValue, nameParts, i, j, nameSegment,
                foundMap, foundI, foundStarMap, starI,
                baseParts = baseName && baseName.split('/'),
                normalizedBaseParts = baseParts,
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name && name.charAt(0) === '.') {
                //If have a base name, try to normalize against it,
                //otherwise, assume it is a top-level require that will
                //be relative to baseUrl in the end.
                if (baseName) {
                    if (getOwn(config.pkgs, baseName)) {
                        //If the baseName is a package name, then just treat it as one
                        //name to concat the name with.
                        normalizedBaseParts = baseParts = [baseName];
                    } else {
                        //Convert baseName to array, and lop off the last part,
                        //so that . matches that 'directory' and not name of the baseName's
                        //module. For instance, baseName of 'one/two/three', maps to
                        //'one/two/three.js', but we want the directory, 'one/two' for
                        //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    }

                    name = normalizedBaseParts.concat(name.split('/'));
                    trimDots(name);

                    //Some use of packages may use a . path to reference the
                    //'main' module name, so normalize for that.
                    pkgConfig = getOwn(config.pkgs, (pkgName = name[0]));
                    name = name.join('/');
                    if (pkgConfig && name === pkgName + '/' + pkgConfig.main) {
                        name = pkgName;
                    }
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    name = name.substring(2);
                }
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break;
                                }
                            }
                        }
                    }

                    if (foundMap) {
                        break;
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            return name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                removeScript(id);
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);
                context.require([id]);
                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        normalizedName = normalize(name, parentName, applyMap);
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length - 1, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return mod.exports;
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            var c,
                                pkg = getOwn(config.pkgs, mod.map.id);
                            // For packages, only support config targeted
                            // at the main module.
                            c = pkg ? getOwn(config.config, mod.map.id + '/' + pkg.main) :
                                      getOwn(config.config, mod.map.id);
                            return  c || {};
                        },
                        exports: defined[mod.map.id]
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var map, modId, err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                map = mod.map;
                modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            if (this.map.isDefine) {
                                //If setting exports via 'module' is in play,
                                //favor that over return value and exports. After that,
                                //favor a non-undefined return value over exports use.
                                cjsModule = this.module;
                                if (cjsModule &&
                                        cjsModule.exports !== undefined &&
                                        //Make sure it is not already the exports value
                                        cjsModule.exports !== this.exports) {
                                    exports = cjsModule.exports;
                                } else if (exports === undefined && this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths and packages since they require special processing,
                //they are additive.
                var pkgs = config.pkgs,
                    shim = config.shim,
                    objs = {
                        paths: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (prop === 'map') {
                            if (!config.map) {
                                config.map = {};
                            }
                            mixin(config[prop], value, true, true);
                        } else {
                            mixin(config[prop], value, true);
                        }
                    } else {
                        config[prop] = value;
                    }
                });

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;
                        location = pkgObj.location;

                        //Create a brand new object on pkgs, since currentPackages can
                        //be passed in again, and config.pkgs is the internal transformed
                        //state for all package configs.
                        pkgs[pkgObj.name] = {
                            name: pkgObj.name,
                            location: location || pkgObj.name,
                            //Remove leading dot in main, so main paths are normalized,
                            //and remove any trailing .js, since different package
                            //envs have different conventions: some use a module name,
                            //some use a file name.
                            main: (pkgObj.main || 'main')
                                  .replace(currDirRegExp, '')
                                  .replace(jsSuffixRegExp, '')
                        };
                    });

                    //Done with modifications, assing packages back to context config
                    config.pkgs = pkgs;
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overriden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, pkgs, pkg, pkgPath, syms, i, parentModule, url,
                    parentPath;

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;
                    pkgs = config.pkgs;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');
                        pkg = getOwn(pkgs, parentModule);
                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        } else if (pkg) {
                            //If module name is just the package name, then looking
                            //for the main module.
                            if (moduleName === pkg.name) {
                                pkgPath = pkg.location + '/' + pkg.main;
                            } else {
                                pkgPath = pkg.location;
                            }
                            syms.splice(0, i, pkgPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = config.xhtml ?
                    document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                    document.createElement('script');
            node.type = config.scriptType || 'text/javascript';
            node.charset = 'utf-8';
            node.async = true;

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                 //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));

define("../lib/require", function(){});

/**
 * @license RequireJS text 2.0.7 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('text',['module'], function (module) {
    

    var text, fs, Cc, Ci,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.7',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node)) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file.indexOf('\uFEFF') === 0) {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                errback(e);
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        errback(err);
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes,
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');

        text.get = function (url, callback) {
            var inStream, convertStream,
                readData = {},
                fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});

define('text!appbuilder.html',[],function () { return '<div class="webmaker-appbuilder-connection-sentence">\n  <div>\n    When <select data-output-action></select>, <select data-input-action></select>.\n  </div>\n  <div>\n    <button data-action="accept">Accept</button><button data-action="cancel">Cancel</button>\n  </div>\n</div>\n<div class="webmaker-appbuilder-connection-list">\n  <ul>\n    <li class="connection-details">\n      <input type="checkbox" checked="checked">\n      <span data-description></span>\n    </li>\n  </ul>\n  <div>\n    <button data-action="accept">Accept</button><button data-action="cancel">Cancel</button>\n  </div>\n</div>';});

define('text!appbuilder.css',[],function () { return '.webmaker-appbuilder-connection-sentence {\n  visibility: hidden;\n  position: fixed;\n  bottom: 0;\n  width: 100%;\n  text-align: center;\n  background-color: rgba(30, 30, 30, 0.85);\n  color: #fff;\n  padding: 5px;\n}\n\n.webmaker-appbuilder-connection-sentence.on {\n  visibility: visible;\n}\n\n.webmaker-appbuilder-connection-list {\n  visibility: hidden;\n  position: fixed;\n  bottom: 0;\n  width: 100%;\n  text-align: center;\n  background-color: rgba(30, 30, 30, 0.85);\n  color: #fff;\n  padding: 5px;\n}\n\n.webmaker-appbuilder-connection-list.on {\n  visibility: visible;\n}\n\n.webmaker-appbuilder-connection-list ul {\n  list-style: none;\n}\n';});

define('ui-util',[], function () {
  return {
    getDomFragmentFromString: function (inputString) {
      var fragment = document.createElement('div');
      fragment.innerHTML = inputString;
      return fragment;
    },
    attachCSSFromString: function (cssString) {
      var element = document.createElement('style');
      element.innerHTML = cssString;
      document.head.appendChild(element);
    }
  }
  
});
define('text!graph-ui.css',[],function () { return '.webmaker-appbuilder-overlay {\n  position: absolute;\n  z-index: 9999;\n  background: rgba(60, 150, 250, 0.7);\n  opacity: 0;\n}\n\n.webmaker-appbuilder-overlay.on {\n  opacity: 1;\n}\n\n.webmaker-appbuilder-line {\n  -webkit-transform-origin: 5px 5px;\n     -moz-transform-origin: 5px 5px;\n      -ms-transform-origin: 5px 5px;\n       -o-transform-origin: 5px 5px;\n          transform-origin: 5px 5px;\n  position: absolute;\n  z-index: 9999;\n  border: 5px solid rgba(60, 250, 150, 0.8);\n  pointer-events: none;\n  margin-top: -2.5px;\n  margin-left: -2.5px;\n  border-radius: 5px;\n}';});

define('text!graph-ui.html',[],function () { return '<div class="webmaker-appbuilder-line"></div>\n<div class="webmaker-appbuilder-overlay"></div>\n';});

define('graph-ui',['text!graph-ui.css', 'text!graph-ui.html', 'ui-util'], function (graph_ui_css, graph_ui_html, ui_util) {
  var __connectionElement = null;
  var __graphElements = [];
  var __overlays = [];
  var __scrollPosition = [0, 0];
  var __lineElement = null;

  var __rootHTML = ui_util.getDomFragmentFromString(graph_ui_html);
  ui_util.attachCSSFromString(graph_ui_css);

  function createLineElement (startX, startY) {
    var element = __rootHTML.querySelector('.webmaker-appbuilder-line').cloneNode(true);
    
    var stopX = startX, stopY = startY;

    element.style.left = startX + 'px';
    element.style.top = startY + 'px';

    function render () {
      var dx = stopX - startX;
      var dy = stopY - startY;
      var h = Math.sqrt(dx*dx + dy*dy);
      var a = Math.atan2(dy, dx) * 180 / Math.PI;

      element.style.width = h + 'px';

      var t = 'rotate(' + a.toFixed(3) + 'deg)';

      element.style.transform = t;
      element.style.WebkitTransform = t;
      element.style.MozTransform = t;
    }

    function onMouseMove (e) {
      stopX = e.clientX + document.body.scrollLeft;
      stopY = e.clientY + document.body.scrollTop;
      render();
    }

    window.addEventListener('mousemove', onMouseMove, false);

    element.stop = function () {
      window.removeEventListener('mousemove', onMouseMove, false);
    };

    render();

    return element;
  }

  function createOverlayForElement (element) {
    var overlay = __rootHTML.querySelector('.webmaker-appbuilder-overlay').cloneNode(true);

    function onMouseOver (e) {
      overlay.classList.add('on');
      __connectionElement = element;
    }

    function onMouseOut (e) {
      overlay.classList.remove('on');
      __connectionElement = null;
    }

    var interval = setInterval(function () {    
      var rect = element.getBoundingClientRect();
      overlay.style.top = rect.top + document.body.scrollTop + 'px';
      overlay.style.left = rect.left + document.body.scrollLeft + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    }, 20);

    overlay.addEventListener('mouseover', onMouseOver, false);
    overlay.addEventListener('mouseout', onMouseOut, false);

    overlay.turnOn = function () {
      overlay.classList.add('on');
    };

    overlay.stop = function () {
      clearInterval(interval);
      overlay.removeEventListener('mouseover', onMouseOver, false);
      overlay.removeEventListener('mouseout', onMouseOut, false);
    };

    element._appbuilder.overlay = overlay;

    return overlay;
  }

  return {
    addElement: function (element) {
      __graphElements.push(element);
    },
    removeElement: function (element) {
      var idx = __graphElements.indexOf(element);
      if (idx > -1) {
        __graphElements.splice(idx, 1);
      }
    },
    createOverlays: function () {
      __graphElements.forEach(function (element) {
        var o = createOverlayForElement(element);
        document.body.appendChild(o);
        __overlays.push(o);
      });
    },
    destroyOverlays: function () {
      while (__overlays.length > 0) {
        var firstOverlay = __overlays.shift();
        firstOverlay.stop();
        firstOverlay.parentNode.removeChild(firstOverlay);
      }
    },
    createSpecificOverlay: function (element) {
      var o = createOverlayForElement(element);
      document.body.appendChild(o);
      o.classList.add('on');
      __overlays.push(o);
    },
    destroySpecificOverlay: function (overlay) {
      if (!overlay.classList.contains('webmaker-appbuilder-overlay')) {
        overlay = overlay._appbuilder.overlay;
      }
      overlay.stop();
      overlay.parentNode.removeChild(overlay);
      var idx = __overlays.indexOf(overlay);
      if (idx > -1) {
        __overlays.splice(idx, 1);
      }
    },
    startDrawingPath: function (startX, startY) {
      __lineElement = createLineElement(startX, startY);
      document.body.appendChild(__lineElement);

      var elementAtStartPoint = document.elementFromPoint(startX, startY);

      while (elementAtStartPoint && !elementAtStartPoint._appbuilder) {
        elementAtStartPoint = elementAtStartPoint.parentNode;
      }

      if (elementAtStartPoint) {
        __connectionElement = elementAtStartPoint;
        __connectionElement._appbuilder.overlay.turnOn();
      }
    },
    stopDrawingPath: function () {
      __lineElement.stop();
      document.body.removeChild(__lineElement);
      var tmpConnectionElement = __connectionElement;
      __connectionElement = null;
      return tmpConnectionElement;
    }
  };

});

define('events',[], function() {
  var eventUUID = 0;

  function createEventManager () {
    var _eventNamespace = 'EventNamespace' + eventUUID++;

    return {
      on: function (type, handler) {
        var namespacedEventName = _eventNamespace + type;
        document.addEventListener(namespacedEventName, handler, false);
      },
      off: function (type, handler) {
        var namespacedEventName = _eventNamespace + type;
        document.removedEventListener(namespacedEventName, handler, false);
      },
      dispatch: function (type, data) {
        var customEvent = document.createEvent('CustomEvent');
        var namespacedEventName = _eventNamespace + type;
        customEvent.initCustomEvent(namespacedEventName, false, false, data);
        document.dispatchEvent(customEvent);
      }
    };
  }

  return {
    createEventManager: createEventManager
  };

});
define('connections',[], function () {

  function Connection (outputEndpoint, outputType, inputEndpoint, inputType) {
    this.inputEndpoint = inputEndpoint;
    this.outputEndpoint = outputEndpoint;
    this.inputType = inputType;
    this.outputType = outputType;

    this.send = function (data) {
      inputEndpoint.receive(inputType, data);
    };
  }
  
  function createEndpoint (parentObject, onReceive) {
    var _outputs = {};
    var _inputs = {};
    var _connections = {
      _parent: parentObject,
      getOutputConnections: function () {
        return _outputs;
      },
      getInputConnections: function () {
        return _inputs;
      },
      getOutputConnection: function (outputType, inputEndpoint, inputType) {
        var outputs = _outputs[outputType];
        if (outputs) {
          var foundConnection;
          outputs.forEach(function (connection) {
            if (connection.inputEndpoint === inputEndpoint && connection.inputType === inputType) {
              foundConnection = connection;
            }
          });
          return foundConnection;
        }
        return null;
      },
      addInputConnection: function (connection) {
        _inputs[connection.inputType] = _inputs[connection.inputType] || [];
        _inputs[connection.inputType].push(connection);
      },
      addOutputConnection: function (connection) {
        _outputs[connection.outputType] = _outputs[connection.outputType] || [];
        _outputs[connection.outputType].push(connection);
      },
      removeInputConnection: function (connection) {
        var inputs = _inputs[connection.inputType];
        if (inputs) {
          var idx = inputs.indexOf(connection);
          if (idx > -1) {
            inputs.splice(idx, 1);
          }
        }
      },
      removeOutputConnection: function (connection) {
        var outputs = _outputs[connection.outputType];
        if (outputs) {
          var idx = outputs.indexOf(connection);
          if (idx > -1) {
            outputs.splice(idx, 1);
          }
        }
      },
      send: function (type, data) {
        var connections = _outputs[type];
        if (connections) {
          connections.forEach(function (c) {
            c.send(data);
          });
        }
      },
      receive: onReceive
    };

    return _connections;
  }

  return {
    createEndpoint: createEndpoint,
    createConnection: function (outputEndpoint, outputType, inputEndpoint, inputType) {
      return new Connection(outputEndpoint, outputType, inputEndpoint, inputType);
    }
  };
});
define('appbuilder',['text!appbuilder.html', 'text!appbuilder.css', 'ui-util', 'graph-ui', 'events', 'connections'],
  function (appbuilder_html, appbuilder_css, ui_util, graph_ui_module, events_module, connections_module) {

  var __registeredElements = [];

  ui_util.attachCSSFromString(appbuilder_css);
  var __rootHTML;

  var __sentencePanelElement;
  var __connectionListElement;
  var __connectionListDetailElement;
  var __currentSentenceController;
  var __connectionElementsForProcessing = [];

  function showConnectionList (element, onAccept, onCancel) {
    var acceptButton = __connectionListElement.querySelector('button[data-action="accept"]');
    var cancelButton = __connectionListElement.querySelector('button[data-action="cancel"]');

    var outputDefinition = element._appbuilder.definition.outputs;
    var connectionListElement = __connectionListElement.querySelector('ul');

    var connections = element._appbuilder.connections.getOutputConnections();

    connectionListElement.innerHTML = '';

    var connectionList = [];

    Object.keys(connections).forEach(function (outputKey) {
      connections[outputKey].forEach(function (connection) {
        var inputString = connection.inputEndpoint._parent.definition.inputs[connection.inputType].description;
        var outputString = outputDefinition[outputKey].description;

        inputString = inputString.replace('{{name}}', 'the ' + element._appbuilder.name);
        outputString = outputString.replace('{{name}}', 'the ' + connection.inputEndpoint._parent.name);

        var itemElement = __connectionListDetailElement.cloneNode(true);
        itemElement.querySelector('*[data-description]').innerHTML = 'When ' + outputString + ', ' + inputString;

        itemElement.querySelector('input[type="checkbox"]')._connection = connection;

        connectionListElement.appendChild(itemElement);
        connectionList.push(connection);
      });
    });

    function onAcceptButtonClick (e) {
      var uncheckedListItems = Array.prototype.slice.call(connectionListElement.querySelectorAll('input[type="checkbox"]')).filter(function (input) {
          return !input.checked;
        }).map(function (input) {
          return input._connection;
        });
      controller.clear();
      onAccept && onAccept(uncheckedListItems);
    }

    function onCancelButtonClick (e) {
      controller.clear();
      onCancel && onCancel();
    }

    if (connectionList.length > 0) {
      __connectionListElement.classList.add('on');  
      acceptButton.addEventListener('click', onAcceptButtonClick, false);
      cancelButton.addEventListener('click', onCancelButtonClick, false);
    }

    var controller = {
      clear: function () {
        acceptButton.removeEventListener('click', onAcceptButtonClick, false);
        cancelButton.removeEventListener('click', onCancelButtonClick, false);
        __connectionListElement.classList.remove('on');
      }
    };

    return controller;
  }

  function openConnectionSentencePanel (outputElement, inputElement, onAccept, onCancel) {
    var outputObject = outputElement._appbuilder;
    var inputObject = inputElement._appbuilder;
    var outputSelectElement = __sentencePanelElement.querySelector('*[data-output-action]')
    var inputSelectElement = __sentencePanelElement.querySelector('*[data-input-action]')
    var acceptButton = __sentencePanelElement.querySelector('button[data-action="accept"]');
    var cancelButton = __sentencePanelElement.querySelector('button[data-action="cancel"]');

    outputSelectElement.innerHTML = '';
    inputSelectElement.innerHTML = '';

    function onInputSelectMouseOver (e) {
      graph_ui_module.createSpecificOverlay(inputElement);
    }

    function onOutputSelectMouseOver (e) {
      graph_ui_module.createSpecificOverlay(outputElement);
    }

    function onInputSelectMouseOut (e) {
      graph_ui_module.destroySpecificOverlay(inputElement);
    }

    function onOutputSelectMouseOut (e) {
      graph_ui_module.destroySpecificOverlay(outputElement);
    }

    function fillSelectElement (selectElement, dictionary, name) {
      Object.keys(dictionary).forEach(function (key) {
        var entry = dictionary[key];
        var optionElement = document.createElement('option');
        var modifiedDescription = entry.description.replace('{{name}}', 'the ' + name);
        optionElement.appendChild(document.createTextNode(modifiedDescription));
        optionElement.title = '' + key + ' (' + entry.type + ')';
        optionElement.value = key;
        selectElement.appendChild(optionElement);
      });
    }

    function onAcceptButtonClick (e) {
      controller.clear();
      onAccept && onAccept(outputSelectElement.value, inputSelectElement.value);
    }

    function onCancelButtonClick (e) {
      controller.clear();
      onCancel && onCancel();
    }

    fillSelectElement(outputSelectElement, outputObject.definition.outputs, outputObject.name);
    fillSelectElement(inputSelectElement, inputObject.definition.inputs, inputObject.name);

    inputSelectElement.addEventListener('mouseover', onInputSelectMouseOver, false);
    outputSelectElement.addEventListener('mouseover', onOutputSelectMouseOver, false);
    inputSelectElement.addEventListener('mouseout', onInputSelectMouseOut, false);
    outputSelectElement.addEventListener('mouseout', onOutputSelectMouseOut, false);

    acceptButton.addEventListener('click', onAcceptButtonClick, false);
    cancelButton.addEventListener('click', onCancelButtonClick, false);

    var controller = {
      clear: function () {
        inputSelectElement.removeEventListener('mouseover', onInputSelectMouseOver, false);
        outputSelectElement.removeEventListener('mouseover', onOutputSelectMouseOver, false);
        inputSelectElement.removeEventListener('mouseout', onInputSelectMouseOut, false);
        outputSelectElement.removeEventListener('mouseout', onOutputSelectMouseOut, false);
        acceptButton.removeEventListener('click', onAcceptButtonClick, false);
        cancelButton.removeEventListener('click', onCancelButtonClick, false);
        __sentencePanelElement.classList.remove('on');
      }
    };

    __sentencePanelElement.classList.add('on');

    return controller;
  }

  var appbuilder = window.appbuilder = window.appbuilder || {};

  appbuilder.createElementOverlays = function () {
      graph_ui_module.createOverlays();
  };
    
  appbuilder.updateStateListenersOnConnect = function (controller) {
    controller.events.on('connect', function (e) {
      Object.keys(controller.states).forEach(function (type) {
        if (e.detail.type === type && controller.states[type]) {
          e.detail.connection.send();
        }
      });
    });
  };
  
  appbuilder.enableGraphMouseEvents = function () {
    __registeredElements.forEach(function (element) {
      element._appbuilder.enableGraphMouseEvents();
    });
  };

  appbuilder.disableGraphMouseEvents = function () {
    __registeredElements.forEach(function (element) {
      element._appbuilder.disableGraphMouseEvents();
    });
  };

  appbuilder.initElement = function (element, definition) {
    definition = definition || element._appbuilder;
    if (!definition) {
      throw "No definition found for element.";
    }

    var controller = element._appbuilder = {};
    controller.events = events_module.createEventManager();
    controller.connections = connections_module.createEndpoint(controller, function (type, data) {
      controller.events.dispatch('receive:' + type, data);
    });

    element.id = element.id || 'appbuilder-element-' + __registeredElements.length;
    controller.name = element.name || element.getAttribute('name') || element.id || element.tagName;
    controller.definition = definition;

    controller.states = definition.states || {};

    controller.onInput = function (type, handler) {
      controller.events.on('receive:' + type, function (e) {
        handler(e.data || e.detail);
      });
    };

    controller.offInput = function (type, handler) {
    };

    controller.sendOutput = function (outputType, data) {
      controller.connections.send(outputType, data);
    };

    controller.connectOutput = function (outputType, otherObject, inputType) {
      var connection = connections_module.createConnection(controller.connections, outputType, otherObject.connections, inputType);
      controller.connections.addOutputConnection(connection);
      otherObject.connections.addInputConnection(connection);
      controller.events.dispatch('connect', {
        to: otherObject,
        type: outputType,
        connection: connection
      });
    };

    controller.findAndDisconnectOutput = function (outputType, otherObject, inputType) {
      var connection = controller.connections.getOutputConection(outputType, from, inputType);
      if (connection) {
        controller.removeOutputConnection(connection);
        otherObject.connections.removeInputConnection(connection);
      }
      controller.events.dispatch('disconnect', otherObject);
    };

    controller.disconnectOutput = function (connection) {
      controller.connections.removeOutputConnection(connection);
      connection.inputEndpoint.removeInputConnection(connection);
    };

    controller.enableGraphMouseEvents = function () {
      element.addEventListener('mousedown', onMouseDown, false);
    };

    controller.disableGraphMouseEvents = function () {
      element.removeEventListener('mousedown', onMouseDown, false);
    };

    graph_ui_module.addElement(element);

    function onMouseDown (e) {
      if (e.which !== 1) { return; }
      e.stopPropagation();
      e.preventDefault();

      var timeout = -1;
      var mouseX = e.clientX, mouseY = e.clientY;

      function onMouseUpBeforeTimeout (e) {
        window.removeEventListener('mouseup', onMouseUpBeforeTimeout, false);
        element.addEventListener('mousedown', onMouseDown, false);
        clearTimeout(timeout);
      }

      function onMouseUpAfterTimeout (e) {
        window.removeEventListener('mouseup', onMouseUpAfterTimeout, false);
        element.addEventListener('mousedown', onMouseDown, false);
        var connectionElement = graph_ui_module.stopDrawingPath();
        graph_ui_module.destroyOverlays();
        if (connectionElement) {
          if (connectionElement !== element) {
            openConnectionSentencePanel(element, connectionElement,
              function (outputType, inputType) {
                element._appbuilder.connectOutput(outputType, connectionElement._appbuilder, inputType);
                graph_ui_module.destroyOverlays();
              },
              function () {
                graph_ui_module.destroyOverlays();
              });
          }
          else {
            showConnectionList(element, function (connectionsToDestroy) {
              connectionsToDestroy.forEach(function (connection) {
                controller.disconnectOutput(connection);
              });
            });
          }
        }
      }

      timeout = setTimeout(function () {
        window.removeEventListener('mouseup', onMouseUpBeforeTimeout, false);
        window.addEventListener('mouseup', onMouseUpAfterTimeout, false);
        graph_ui_module.createOverlays();
        graph_ui_module.startDrawingPath(mouseX + document.body.scrollLeft, mouseY + document.body.scrollTop);
        timeout = -1;
      }, 500);

      window.addEventListener('mouseup', onMouseUpBeforeTimeout, false);
      element.removeEventListener('mousedown', onMouseDown, false);
    }

    __registeredElements.push(element);

    if (controller.definition.connectionElements &&
        controller.definition.connectionElements.length &&
        typeof controller.definition.connectionElements !== 'string') {
      Array.prototype.slice.call(controller.definition.connectionElements).forEach(function (connectionElement) {
        var querySelector = element.id ? '#' + element.id : (element.name ? element.tagName + '[name="' + element.name + '"]' : '');
        connectionElement.setAttribute('from', querySelector);
        __connectionElementsForProcessing.push(connectionElement);
      });
    }

    return controller;
  };

  function processConnectionElement (connectionElement) {
    var outputElement;

    outputElement = connectionElement.parentNode;
    while (outputElement && __registeredElements.indexOf(outputElement) === -1) {
      outputElement = outputElement.parentNode;
    }

    if (!outputElement) {
      if (connectionElement.hasAttribute('from')) {
        outputElement = document.querySelector(connectionElement.getAttribute('from'));
      }
    }

    if (outputElement) {
      var inputElementName = connectionElement.getAttribute('to');
      var outputType = connectionElement.getAttribute('out');
      var inputType = connectionElement.getAttribute('in');
      var inputElement = document.querySelector(inputElementName);

      if (inputElement && outputType && inputType && inputElement._appbuilder) {
        outputElement._appbuilder.connectOutput(outputType, inputElement._appbuilder, inputType);
      }
    }
  }

  function initPage () {
    // This dom fragment init is here to let the Polymer polyfills load and init first
    __rootHTML = ui_util.getDomFragmentFromString(appbuilder_html);
    __sentencePanelElement = __rootHTML.querySelector('.webmaker-appbuilder-connection-sentence').cloneNode(true);
    __connectionListElement = __rootHTML.querySelector('.webmaker-appbuilder-connection-list').cloneNode(true);
    __connectionListDetailElement = __connectionListElement.querySelector('.connection-details');

    document.body.appendChild(__sentencePanelElement);
    document.body.appendChild(__connectionListElement);
    __connectionListDetailElement.parentNode.removeChild(__connectionListDetailElement);

    window.addEventListener('appbuilderloaded', function (e) {
      // admittedly hacky
      setTimeout(function () {
        var connectionElements = Array.prototype.slice.call(document.querySelectorAll('appbuilder-connection')).concat(__connectionElementsForProcessing);
        connectionElements.forEach(processConnectionElement);
      }, 100);
    }, false);

    var customEvent = document.createEvent('CustomEvent');
    customEvent.initCustomEvent('appbuilderloaded', false, false, appbuilder);
    window.dispatchEvent(customEvent);
  }

  if (document.body && ['complete', 'interactive'].indexOf(document.readyState > -1)) {
    setTimeout(initPage, 100);
  }
  else {
    document.addEventListener('DOMContentLoaded', initPage, false);
  }

  return appbuilder;

});
// Copyright (c) 2012 The Polymer Authors. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//    * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
//    * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
//    * Neither the name of Google Inc. nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
function PointerGestureEvent(inType, inDict) {
    var dict = inDict || {}, e = document.createEvent("Event"), props = {
        bubbles: !0,
        cancelable: !0
    };
    return Object.keys(props).forEach(function(k) {
        k in dict && (props[k] = dict[k]);
    }), e.initEvent(inType, props.bubbles, props.cancelable), Object.keys(dict).forEach(function(k) {
        e[k] = inDict[k];
    }), e.preventTap = this.preventTap, e;
}

if (window.Platform = window.Platform || {}, window.logFlags = window.logFlags || {}, 
function(scope) {
    var flags = scope.flags || {};
    location.search.slice(1).split("&").forEach(function(o) {
        o = o.split("="), o[0] && (flags[o[0]] = o[1] || !0);
    }), flags.shadow = (flags.shadowdom || flags.shadow || flags.polyfill || !HTMLElement.prototype.webkitCreateShadowRoot) && "polyfill", 
    scope.flags = flags;
}(Platform), "polyfill" === Platform.flags.shadow) {
    var SideTable;
    "undefined" != typeof WeakMap && navigator.userAgent.indexOf("Firefox/") < 0 ? SideTable = WeakMap : function() {
        var defineProperty = Object.defineProperty, hasOwnProperty = Object.hasOwnProperty, counter = new Date().getTime() % 1e9;
        SideTable = function() {
            this.name = "__st" + (1e9 * Math.random() >>> 0) + (counter++ + "__");
        }, SideTable.prototype = {
            set: function(key, value) {
                defineProperty(key, this.name, {
                    value: value,
                    writable: !0
                });
            },
            get: function(key) {
                return hasOwnProperty.call(key, this.name) ? key[this.name] : void 0;
            },
            "delete": function(key) {
                this.set(key, void 0);
            }
        };
    }();
    var ShadowDOMPolyfill = {};
    (function(scope) {
        
        function assert(b) {
            if (!b) throw new Error("Assertion failed");
        }
        function mixin(to, from) {
            return Object.getOwnPropertyNames(from).forEach(function(name) {
                Object.defineProperty(to, name, Object.getOwnPropertyDescriptor(from, name));
            }), to;
        }
        function mixinStatics(to, from) {
            return Object.getOwnPropertyNames(from).forEach(function(name) {
                switch (name) {
                  case "arguments":
                  case "caller":
                  case "length":
                  case "name":
                  case "prototype":
                  case "toString":
                    return;
                }
                Object.defineProperty(to, name, Object.getOwnPropertyDescriptor(from, name));
            }), to;
        }
        function getWrapperConstructor(node) {
            var nativePrototype = node.__proto__ || Object.getPrototypeOf(node), wrapperConstructor = constructorTable.get(nativePrototype);
            if (wrapperConstructor) return wrapperConstructor;
            var parentWrapperConstructor = getWrapperConstructor(nativePrototype), GeneratedWrapper = createWrapperConstructor(parentWrapperConstructor);
            return registerInternal(nativePrototype, GeneratedWrapper, node), GeneratedWrapper;
        }
        function addForwardingProperties(nativePrototype, wrapperPrototype) {
            installProperty(nativePrototype, wrapperPrototype, !0);
        }
        function registerInstanceProperties(wrapperPrototype, instanceObject) {
            installProperty(instanceObject, wrapperPrototype, !1);
        }
        function isEventHandlerName(name) {
            return /^on[a-z]+$/.test(name);
        }
        function installProperty(source, target, allowMethod) {
            Object.getOwnPropertyNames(source).forEach(function(name) {
                if (!(name in target)) {
                    isFirefox && source.__lookupGetter__(name);
                    var descriptor;
                    try {
                        descriptor = Object.getOwnPropertyDescriptor(source, name);
                    } catch (ex) {
                        descriptor = dummyDescriptor;
                    }
                    var getter, setter;
                    if (allowMethod && "function" == typeof descriptor.value) return target[name] = function() {
                        return this.impl[name].apply(this.impl, arguments);
                    }, void 0;
                    var isEvent = isEventHandlerName(name);
                    getter = isEvent ? scope.getEventHandlerGetter(name) : function() {
                        return this.impl[name];
                    }, (descriptor.writable || descriptor.set) && (setter = isEvent ? scope.getEventHandlerSetter(name) : function(value) {
                        this.impl[name] = value;
                    }), Object.defineProperty(target, name, {
                        get: getter,
                        set: setter,
                        configurable: descriptor.configurable,
                        enumerable: descriptor.enumerable
                    });
                }
            });
        }
        function register(nativeConstructor, wrapperConstructor, opt_instance) {
            var nativePrototype = nativeConstructor.prototype;
            registerInternal(nativePrototype, wrapperConstructor, opt_instance), mixinStatics(wrapperConstructor, nativeConstructor);
        }
        function registerInternal(nativePrototype, wrapperConstructor, opt_instance) {
            var wrapperPrototype = wrapperConstructor.prototype;
            assert(void 0 === constructorTable.get(nativePrototype)), constructorTable.set(nativePrototype, wrapperConstructor), 
            addForwardingProperties(nativePrototype, wrapperPrototype), opt_instance && registerInstanceProperties(wrapperPrototype, opt_instance);
        }
        function isWrapperFor(wrapperConstructor, nativeConstructor) {
            return constructorTable.get(nativeConstructor.prototype) === wrapperConstructor;
        }
        function registerObject(object) {
            var nativePrototype = Object.getPrototypeOf(object), superWrapperConstructor = getWrapperConstructor(nativePrototype), GeneratedWrapper = createWrapperConstructor(superWrapperConstructor);
            return registerInternal(nativePrototype, GeneratedWrapper, object), GeneratedWrapper;
        }
        function createWrapperConstructor(superWrapperConstructor) {
            function GeneratedWrapper(node) {
                superWrapperConstructor.call(this, node);
            }
            return GeneratedWrapper.prototype = Object.create(superWrapperConstructor.prototype), 
            GeneratedWrapper.prototype.constructor = GeneratedWrapper, GeneratedWrapper;
        }
        function isWrapper(object) {
            return object instanceof wrappers.EventTarget || object instanceof wrappers.Event || object instanceof wrappers.DOMImplementation;
        }
        function isNative(object) {
            return object instanceof OriginalNode || object instanceof OriginalEvent || object instanceof OriginalWindow || object instanceof OriginalDOMImplementation;
        }
        function wrap(impl) {
            if (null === impl) return null;
            assert(isNative(impl));
            var wrapper = wrapperTable.get(impl);
            if (!wrapper) {
                var wrapperConstructor = getWrapperConstructor(impl);
                wrapper = new wrapperConstructor(impl), wrapperTable.set(impl, wrapper);
            }
            return wrapper;
        }
        function unwrap(wrapper) {
            return null === wrapper ? null : (assert(isWrapper(wrapper)), wrapper.impl);
        }
        function unwrapIfNeeded(object) {
            return object && isWrapper(object) ? unwrap(object) : object;
        }
        function wrapIfNeeded(object) {
            return object && !isWrapper(object) ? wrap(object) : object;
        }
        function rewrap(node, wrapper) {
            null !== wrapper && (assert(isNative(node)), assert(void 0 === wrapper || isWrapper(wrapper)), 
            wrapperTable.set(node, wrapper));
        }
        function defineGetter(constructor, name, getter) {
            Object.defineProperty(constructor.prototype, name, {
                get: getter,
                configurable: !0,
                enumerable: !0
            });
        }
        function defineWrapGetter(constructor, name) {
            defineGetter(constructor, name, function() {
                return wrap(this.impl[name]);
            });
        }
        function forwardMethodsToWrapper(constructors, names) {
            constructors.forEach(function(constructor) {
                names.forEach(function(name) {
                    constructor.prototype[name] = function() {
                        var w = wrap(this);
                        return w[name].apply(w, arguments);
                    };
                });
            });
        }
        var wrapperTable = new SideTable(), constructorTable = new SideTable(), wrappers = Object.create(null);
        Object.getOwnPropertyNames(window);
        var isFirefox = /Firefox/.test(navigator.userAgent), dummyDescriptor = {
            get: function() {},
            set: function() {},
            configurable: !0,
            enumerable: !0
        }, OriginalDOMImplementation = DOMImplementation, OriginalEvent = Event, OriginalNode = Node, OriginalWindow = Window;
        scope.assert = assert, scope.defineGetter = defineGetter, scope.defineWrapGetter = defineWrapGetter, 
        scope.forwardMethodsToWrapper = forwardMethodsToWrapper, scope.isWrapperFor = isWrapperFor, 
        scope.mixin = mixin, scope.registerObject = registerObject, scope.registerWrapper = register, 
        scope.rewrap = rewrap, scope.unwrap = unwrap, scope.unwrapIfNeeded = unwrapIfNeeded, 
        scope.wrap = wrap, scope.wrapIfNeeded = wrapIfNeeded, scope.wrappers = wrappers;
    })(this.ShadowDOMPolyfill), function(scope) {
        
        function isShadowRoot(node) {
            return node instanceof wrappers.ShadowRoot;
        }
        function isInsertionPoint(node) {
            var localName = node.localName;
            return "content" === localName || "shadow" === localName;
        }
        function isShadowHost(node) {
            return !!node.shadowRoot;
        }
        function getEventParent(node) {
            var dv;
            return node.parentNode || (dv = node.defaultView) && wrap(dv) || null;
        }
        function calculateParents(node, context, ancestors) {
            if (ancestors.length) return ancestors.shift();
            if (isShadowRoot(node)) return getInsertionParent(node) || scope.getHostForShadowRoot(node);
            var eventParents = scope.eventParentsTable.get(node);
            if (eventParents) {
                for (var i = 1; i < eventParents.length; i++) ancestors[i - 1] = eventParents[i];
                return eventParents[0];
            }
            if (context && isInsertionPoint(node)) {
                var parentNode = node.parentNode;
                if (parentNode && isShadowHost(parentNode)) for (var trees = scope.getShadowTrees(parentNode), p = getInsertionParent(context), i = 0; i < trees.length; i++) if (trees[i].contains(p)) return p;
            }
            return getEventParent(node);
        }
        function retarget(node) {
            for (var stack = [], ancestor = node, targets = [], ancestors = []; ancestor; ) {
                var context = null;
                if (isInsertionPoint(ancestor)) {
                    context = topMostNotInsertionPoint(stack);
                    var top = stack[stack.length - 1] || ancestor;
                    stack.push(top);
                } else stack.length || stack.push(ancestor);
                var target = stack[stack.length - 1];
                targets.push({
                    target: target,
                    currentTarget: ancestor
                }), isShadowRoot(ancestor) && stack.pop(), ancestor = calculateParents(ancestor, context, ancestors);
            }
            return targets;
        }
        function topMostNotInsertionPoint(stack) {
            for (var i = stack.length - 1; i >= 0; i--) if (!isInsertionPoint(stack[i])) return stack[i];
            return null;
        }
        function adjustRelatedTarget(target, related) {
            for (var ancestors = []; target; ) {
                for (var stack = [], ancestor = related, last = void 0; ancestor; ) {
                    var context = null;
                    if (stack.length) {
                        if (isInsertionPoint(ancestor) && (context = topMostNotInsertionPoint(stack), isDistributed(last))) {
                            var head = stack[stack.length - 1];
                            stack.push(head);
                        }
                    } else stack.push(ancestor);
                    if (inSameTree(ancestor, target)) return stack[stack.length - 1];
                    isShadowRoot(ancestor) && stack.pop(), last = ancestor, ancestor = calculateParents(ancestor, context, ancestors);
                }
                target = isShadowRoot(target) ? scope.getHostForShadowRoot(target) : target.parentNode;
            }
        }
        function getInsertionParent(node) {
            return scope.insertionParentTable.get(node);
        }
        function isDistributed(node) {
            return getInsertionParent(node);
        }
        function rootOfNode(node) {
            for (var p; p = node.parentNode; ) node = p;
            return node;
        }
        function inSameTree(a, b) {
            return rootOfNode(a) === rootOfNode(b);
        }
        function isMutationEvent(type) {
            switch (type) {
              case "DOMAttrModified":
              case "DOMAttributeNameChanged":
              case "DOMCharacterDataModified":
              case "DOMElementNameChanged":
              case "DOMNodeInserted":
              case "DOMNodeInsertedIntoDocument":
              case "DOMNodeRemoved":
              case "DOMNodeRemovedFromDocument":
              case "DOMSubtreeModified":
                return !0;
            }
            return !1;
        }
        function dispatchOriginalEvent(originalEvent) {
            if (!handledEventsTable.get(originalEvent)) {
                handledEventsTable.set(originalEvent, !0), isMutationEvent(originalEvent.type) || scope.renderAllPending();
                var target = wrap(originalEvent.target), event = wrap(originalEvent);
                return dispatchEvent(event, target);
            }
        }
        function dispatchEvent(event, originalWrapperTarget) {
            var eventPath = retarget(originalWrapperTarget);
            return "load" === event.type && 2 === eventPath.length && eventPath[0].target instanceof wrappers.Document && eventPath.shift(), 
            eventPathTable.set(event, eventPath), dispatchCapturing(event, eventPath) && dispatchAtTarget(event, eventPath) && dispatchBubbling(event, eventPath), 
            eventPhaseTable.set(event, Event.NONE), currentTargetTable.set(event, null), event.defaultPrevented;
        }
        function dispatchCapturing(event, eventPath) {
            for (var phase, i = eventPath.length - 1; i > 0; i--) {
                var target = eventPath[i].target, currentTarget = eventPath[i].currentTarget;
                if (target !== currentTarget && (phase = Event.CAPTURING_PHASE, !invoke(eventPath[i], event, phase))) return !1;
            }
            return !0;
        }
        function dispatchAtTarget(event, eventPath) {
            var phase = Event.AT_TARGET;
            return invoke(eventPath[0], event, phase);
        }
        function dispatchBubbling(event, eventPath) {
            for (var phase, bubbles = event.bubbles, i = 1; i < eventPath.length; i++) {
                var target = eventPath[i].target, currentTarget = eventPath[i].currentTarget;
                if (target === currentTarget) phase = Event.AT_TARGET; else {
                    if (!bubbles || stopImmediatePropagationTable.get(event)) continue;
                    phase = Event.BUBBLING_PHASE;
                }
                if (!invoke(eventPath[i], event, phase)) return;
            }
        }
        function invoke(tuple, event, phase) {
            var target = tuple.target, currentTarget = tuple.currentTarget, listeners = listenersTable.get(currentTarget);
            if (!listeners) return !0;
            if ("relatedTarget" in event) {
                var originalEvent = unwrap(event), relatedTarget = wrap(originalEvent.relatedTarget), adjusted = adjustRelatedTarget(currentTarget, relatedTarget);
                if (adjusted === target) return !0;
                relatedTargetTable.set(event, adjusted);
            }
            eventPhaseTable.set(event, phase);
            var type = event.type, anyRemoved = !1;
            targetTable.set(event, target), currentTargetTable.set(event, currentTarget);
            for (var i = 0; i < listeners.length; i++) {
                var listener = listeners[i];
                if (listener.removed) anyRemoved = !0; else if (!(listener.type !== type || !listener.capture && phase === Event.CAPTURING_PHASE || listener.capture && phase === Event.BUBBLING_PHASE)) try {
                    if ("function" == typeof listener.handler ? listener.handler.call(currentTarget, event) : listener.handler.handleEvent(event), 
                    stopImmediatePropagationTable.get(event)) return !1;
                } catch (ex) {
                    window.onerror ? window.onerror(ex.message) : console.error(ex);
                }
            }
            if (anyRemoved) {
                var copy = listeners.slice();
                listeners.length = 0;
                for (var i = 0; i < copy.length; i++) copy[i].removed || listeners.push(copy[i]);
            }
            return !stopPropagationTable.get(event);
        }
        function Listener(type, handler, capture) {
            this.type = type, this.handler = handler, this.capture = Boolean(capture);
        }
        function Event(type, options) {
            return type instanceof OriginalEvent ? (this.impl = type, void 0) : wrap(constructEvent(OriginalEvent, "Event", type, options));
        }
        function unwrapOptions(options) {
            return options && options.relatedTarget ? Object.create(options, {
                relatedTarget: {
                    value: unwrap(options.relatedTarget)
                }
            }) : options;
        }
        function registerGenericEvent(name, SuperEvent, prototype) {
            var OriginalEvent = window[name], GenericEvent = function(type, options) {
                return type instanceof OriginalEvent ? (this.impl = type, void 0) : wrap(constructEvent(OriginalEvent, name, type, options));
            };
            return GenericEvent.prototype = Object.create(SuperEvent.prototype), prototype && mixin(GenericEvent.prototype, prototype), 
            OriginalEvent && registerWrapper(OriginalEvent, GenericEvent, document.createEvent(name)), 
            GenericEvent;
        }
        function getInitFunction(name, relatedTargetIndex) {
            return function() {
                arguments[relatedTargetIndex] = unwrap(arguments[relatedTargetIndex]);
                var impl = unwrap(this);
                impl[name].apply(impl, arguments);
            };
        }
        function constructEvent(OriginalEvent, name, type, options) {
            if (supportsEventConstructors) return new OriginalEvent(type, unwrapOptions(options));
            var event = unwrap(document.createEvent(name)), defaultDict = defaultInitDicts[name], args = [ type ];
            return Object.keys(defaultDict).forEach(function(key) {
                var v = null != options && key in options ? options[key] : defaultDict[key];
                "relatedTarget" === key && (v = unwrap(v)), args.push(v);
            }), event["init" + name].apply(event, args), event;
        }
        function isValidListener(fun) {
            return "function" == typeof fun ? !0 : fun && fun.handleEvent;
        }
        function EventTarget(impl) {
            this.impl = impl;
        }
        function getTargetToListenAt(wrapper) {
            return wrapper instanceof wrappers.ShadowRoot && (wrapper = scope.getHostForShadowRoot(wrapper)), 
            unwrap(wrapper);
        }
        function wrapEventTargetMethods(constructors) {
            forwardMethodsToWrapper(constructors, methodNames);
        }
        function elementFromPoint(self, document, x, y) {
            scope.renderAllPending();
            for (var element = wrap(originalElementFromPoint.call(document.impl, x, y)), targets = retarget(element, this), i = 0; i < targets.length; i++) {
                var target = targets[i];
                if (target.currentTarget === self) return target.target;
            }
            return null;
        }
        function getEventHandlerGetter(name) {
            return function() {
                var inlineEventHandlers = eventHandlersTable.get(this);
                return inlineEventHandlers && inlineEventHandlers[name] && inlineEventHandlers[name].value || null;
            };
        }
        function getEventHandlerSetter(name) {
            var eventType = name.slice(2);
            return function(value) {
                var inlineEventHandlers = eventHandlersTable.get(this);
                inlineEventHandlers || (inlineEventHandlers = Object.create(null), eventHandlersTable.set(this, inlineEventHandlers));
                var old = inlineEventHandlers[name];
                if (old && this.removeEventListener(eventType, old.wrapped, !1), "function" == typeof value) {
                    var wrapped = function(e) {
                        var rv = value.call(this, e);
                        rv === !1 ? e.preventDefault() : "onbeforeunload" === name && "string" == typeof rv && (e.returnValue = rv);
                    };
                    this.addEventListener(eventType, wrapped, !1), inlineEventHandlers[name] = {
                        value: value,
                        wrapped: wrapped
                    };
                }
            };
        }
        var forwardMethodsToWrapper = scope.forwardMethodsToWrapper, mixin = scope.mixin, registerWrapper = scope.registerWrapper, unwrap = scope.unwrap, wrap = scope.wrap, wrappers = scope.wrappers;
        new SideTable();
        var listenersTable = new SideTable(), handledEventsTable = new SideTable(), targetTable = new SideTable(), currentTargetTable = new SideTable(), relatedTargetTable = new SideTable(), eventPhaseTable = new SideTable(), stopPropagationTable = new SideTable(), stopImmediatePropagationTable = new SideTable(), eventHandlersTable = new SideTable(), eventPathTable = new SideTable();
        Listener.prototype = {
            equals: function(that) {
                return this.handler === that.handler && this.type === that.type && this.capture === that.capture;
            },
            get removed() {
                return null === this.handler;
            },
            remove: function() {
                this.handler = null;
            }
        };
        var OriginalEvent = window.Event;
        Event.prototype = {
            get target() {
                return targetTable.get(this);
            },
            get currentTarget() {
                return currentTargetTable.get(this);
            },
            get eventPhase() {
                return eventPhaseTable.get(this);
            },
            get path() {
                var nodeList = new wrappers.NodeList(), eventPath = eventPathTable.get(this);
                if (eventPath) {
                    for (var index = 0, found = !1, currentTarget = currentTargetTable.get(this), lastIndex = eventPath.length - 1, i = 0; lastIndex >= i; i++) if (found || (found = eventPath[i].currentTarget === currentTarget), 
                    found) {
                        var node = eventPath[i].currentTarget;
                        (i !== lastIndex || node instanceof wrappers.Node) && (nodeList[index++] = node);
                    }
                    nodeList.length = index;
                }
                return nodeList;
            },
            stopPropagation: function() {
                stopPropagationTable.set(this, !0);
            },
            stopImmediatePropagation: function() {
                stopPropagationTable.set(this, !0), stopImmediatePropagationTable.set(this, !0);
            }
        }, registerWrapper(OriginalEvent, Event, document.createEvent("Event"));
        var UIEvent = registerGenericEvent("UIEvent", Event), CustomEvent = registerGenericEvent("CustomEvent", Event), relatedTargetProto = {
            get relatedTarget() {
                return relatedTargetTable.get(this) || wrap(unwrap(this).relatedTarget);
            }
        }, mouseEventProto = mixin({
            initMouseEvent: getInitFunction("initMouseEvent", 14)
        }, relatedTargetProto), focusEventProto = mixin({
            initFocusEvent: getInitFunction("initFocusEvent", 5)
        }, relatedTargetProto), MouseEvent = registerGenericEvent("MouseEvent", UIEvent, mouseEventProto), FocusEvent = registerGenericEvent("FocusEvent", UIEvent, focusEventProto), MutationEvent = registerGenericEvent("MutationEvent", Event, {
            initMutationEvent: getInitFunction("initMutationEvent", 3),
            get relatedNode() {
                return wrap(this.impl.relatedNode);
            }
        }), defaultInitDicts = Object.create(null), supportsEventConstructors = function() {
            try {
                new window.MouseEvent("click");
            } catch (ex) {
                return !1;
            }
            return !0;
        }();
        if (!supportsEventConstructors) {
            var configureEventConstructor = function(name, initDict, superName) {
                if (superName) {
                    var superDict = defaultInitDicts[superName];
                    initDict = mixin(mixin({}, superDict), initDict);
                }
                defaultInitDicts[name] = initDict;
            };
            configureEventConstructor("Event", {
                bubbles: !1,
                cancelable: !1
            }), configureEventConstructor("CustomEvent", {
                detail: null
            }, "Event"), configureEventConstructor("UIEvent", {
                view: null,
                detail: 0
            }, "Event"), configureEventConstructor("MouseEvent", {
                screenX: 0,
                screenY: 0,
                clientX: 0,
                clientY: 0,
                ctrlKey: !1,
                altKey: !1,
                shiftKey: !1,
                metaKey: !1,
                button: 0,
                relatedTarget: null
            }, "UIEvent"), configureEventConstructor("FocusEvent", {
                relatedTarget: null
            }, "UIEvent");
        }
        var OriginalEventTarget = window.EventTarget, methodNames = [ "addEventListener", "removeEventListener", "dispatchEvent" ];
        [ Element, Window, Document ].forEach(function(constructor) {
            var p = constructor.prototype;
            methodNames.forEach(function(name) {
                Object.defineProperty(p, name + "_", {
                    value: p[name]
                });
            });
        }), EventTarget.prototype = {
            addEventListener: function(type, fun, capture) {
                if (isValidListener(fun)) {
                    var listener = new Listener(type, fun, capture), listeners = listenersTable.get(this);
                    if (listeners) {
                        for (var i = 0; i < listeners.length; i++) if (listener.equals(listeners[i])) return;
                    } else listeners = [], listenersTable.set(this, listeners);
                    listeners.push(listener);
                    var target = getTargetToListenAt(this);
                    target.addEventListener_(type, dispatchOriginalEvent, !0);
                }
            },
            removeEventListener: function(type, fun, capture) {
                capture = Boolean(capture);
                var listeners = listenersTable.get(this);
                if (listeners) {
                    for (var count = 0, found = !1, i = 0; i < listeners.length; i++) listeners[i].type === type && listeners[i].capture === capture && (count++, 
                    listeners[i].handler === fun && (found = !0, listeners[i].remove()));
                    if (found && 1 === count) {
                        var target = getTargetToListenAt(this);
                        target.removeEventListener_(type, dispatchOriginalEvent, !0);
                    }
                }
            },
            dispatchEvent: function(event) {
                var target = getTargetToListenAt(this);
                return target.dispatchEvent_(unwrap(event));
            }
        }, OriginalEventTarget && registerWrapper(OriginalEventTarget, EventTarget);
        var originalElementFromPoint = document.elementFromPoint;
        scope.adjustRelatedTarget = adjustRelatedTarget, scope.elementFromPoint = elementFromPoint, 
        scope.getEventHandlerGetter = getEventHandlerGetter, scope.getEventHandlerSetter = getEventHandlerSetter, 
        scope.wrapEventTargetMethods = wrapEventTargetMethods, scope.wrappers.CustomEvent = CustomEvent, 
        scope.wrappers.Event = Event, scope.wrappers.EventTarget = EventTarget, scope.wrappers.FocusEvent = FocusEvent, 
        scope.wrappers.MouseEvent = MouseEvent, scope.wrappers.MutationEvent = MutationEvent, 
        scope.wrappers.UIEvent = UIEvent;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function nonEnum(obj, prop) {
            Object.defineProperty(obj, prop, {
                enumerable: !1
            });
        }
        function NodeList() {
            this.length = 0, nonEnum(this, "length");
        }
        function wrapNodeList(list) {
            if (null == list) return list;
            for (var wrapperList = new NodeList(), i = 0, length = list.length; length > i; i++) wrapperList[i] = wrap(list[i]);
            return wrapperList.length = length, wrapperList;
        }
        function addWrapNodeListMethod(wrapperConstructor, name) {
            wrapperConstructor.prototype[name] = function() {
                return wrapNodeList(this.impl[name].apply(this.impl, arguments));
            };
        }
        var wrap = scope.wrap;
        NodeList.prototype = {
            item: function(index) {
                return this[index];
            }
        }, nonEnum(NodeList.prototype, "item"), scope.wrappers.NodeList = NodeList, scope.addWrapNodeListMethod = addWrapNodeListMethod, 
        scope.wrapNodeList = wrapNodeList;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function assertIsNodeWrapper(node) {
            assert(node instanceof Node);
        }
        function collectNodes(node, parentNode, previousNode, nextNode) {
            if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return node.parentNode && node.parentNode.removeChild(node), 
            node.parentNode_ = parentNode, node.previousSibling_ = previousNode, node.nextSibling_ = nextNode, 
            previousNode && (previousNode.nextSibling_ = node), nextNode && (nextNode.previousSibling_ = node), 
            [ node ];
            for (var firstChild, nodes = []; firstChild = node.firstChild; ) node.removeChild(firstChild), 
            nodes.push(firstChild), firstChild.parentNode_ = parentNode;
            for (var i = 0; i < nodes.length; i++) nodes[i].previousSibling_ = nodes[i - 1] || previousNode, 
            nodes[i].nextSibling_ = nodes[i + 1] || nextNode;
            return previousNode && (previousNode.nextSibling_ = nodes[0]), nextNode && (nextNode.previousSibling_ = nodes[nodes.length - 1]), 
            nodes;
        }
        function unwrapNodesForInsertion(owner, nodes) {
            var length = nodes.length;
            if (1 === length) return unwrap(nodes[0]);
            for (var df = unwrap(owner.ownerDocument.createDocumentFragment()), i = 0; length > i; i++) df.appendChild(unwrap(nodes[i]));
            return df;
        }
        function removeAllChildNodes(wrapper) {
            for (var childWrapper = wrapper.firstChild; childWrapper; ) {
                assert(childWrapper.parentNode === wrapper);
                var nextSibling = childWrapper.nextSibling, childNode = unwrap(childWrapper), parentNode = childNode.parentNode;
                parentNode && originalRemoveChild.call(parentNode, childNode), childWrapper.previousSibling_ = childWrapper.nextSibling_ = childWrapper.parentNode_ = null, 
                childWrapper = nextSibling;
            }
            wrapper.firstChild_ = wrapper.lastChild_ = null;
        }
        function Node(original) {
            assert(original instanceof OriginalNode), EventTarget.call(this, original), this.parentNode_ = void 0, 
            this.firstChild_ = void 0, this.lastChild_ = void 0, this.nextSibling_ = void 0, 
            this.previousSibling_ = void 0;
        }
        var EventTarget = scope.wrappers.EventTarget, NodeList = scope.wrappers.NodeList, defineWrapGetter = scope.defineWrapGetter, assert = scope.assert, mixin = scope.mixin, registerWrapper = scope.registerWrapper, unwrap = scope.unwrap, wrap = scope.wrap, OriginalNode = window.Node, originalAppendChild = OriginalNode.prototype.appendChild, originalInsertBefore = OriginalNode.prototype.insertBefore, originalReplaceChild = OriginalNode.prototype.replaceChild, originalRemoveChild = OriginalNode.prototype.removeChild, originalCompareDocumentPosition = OriginalNode.prototype.compareDocumentPosition;
        Node.prototype = Object.create(EventTarget.prototype), mixin(Node.prototype, {
            appendChild: function(childWrapper) {
                assertIsNodeWrapper(childWrapper), this.invalidateShadowRenderer();
                var previousNode = this.lastChild, nextNode = null, nodes = collectNodes(childWrapper, this, previousNode, nextNode);
                return this.lastChild_ = nodes[nodes.length - 1], previousNode || (this.firstChild_ = nodes[0]), 
                originalAppendChild.call(this.impl, unwrapNodesForInsertion(this, nodes)), childWrapper;
            },
            insertBefore: function(childWrapper, refWrapper) {
                if (!refWrapper) return this.appendChild(childWrapper);
                assertIsNodeWrapper(childWrapper), assertIsNodeWrapper(refWrapper), assert(refWrapper.parentNode === this), 
                this.invalidateShadowRenderer();
                var previousNode = refWrapper.previousSibling, nextNode = refWrapper, nodes = collectNodes(childWrapper, this, previousNode, nextNode);
                this.firstChild === refWrapper && (this.firstChild_ = nodes[0]);
                var refNode = unwrap(refWrapper), parentNode = refNode.parentNode;
                return parentNode && originalInsertBefore.call(parentNode, unwrapNodesForInsertion(this, nodes), refNode), 
                childWrapper;
            },
            removeChild: function(childWrapper) {
                if (assertIsNodeWrapper(childWrapper), childWrapper.parentNode !== this) throw new Error("NotFoundError");
                this.invalidateShadowRenderer();
                var thisFirstChild = this.firstChild, thisLastChild = this.lastChild, childWrapperNextSibling = childWrapper.nextSibling, childWrapperPreviousSibling = childWrapper.previousSibling, childNode = unwrap(childWrapper), parentNode = childNode.parentNode;
                return parentNode && originalRemoveChild.call(parentNode, childNode), thisFirstChild === childWrapper && (this.firstChild_ = childWrapperNextSibling), 
                thisLastChild === childWrapper && (this.lastChild_ = childWrapperPreviousSibling), 
                childWrapperPreviousSibling && (childWrapperPreviousSibling.nextSibling_ = childWrapperNextSibling), 
                childWrapperNextSibling && (childWrapperNextSibling.previousSibling_ = childWrapperPreviousSibling), 
                childWrapper.previousSibling_ = childWrapper.nextSibling_ = childWrapper.parentNode_ = null, 
                childWrapper;
            },
            replaceChild: function(newChildWrapper, oldChildWrapper) {
                if (assertIsNodeWrapper(newChildWrapper), assertIsNodeWrapper(oldChildWrapper), 
                oldChildWrapper.parentNode !== this) throw new Error("NotFoundError");
                this.invalidateShadowRenderer();
                var previousNode = oldChildWrapper.previousSibling, nextNode = oldChildWrapper.nextSibling;
                nextNode === newChildWrapper && (nextNode = newChildWrapper.nextSibling);
                var nodes = collectNodes(newChildWrapper, this, previousNode, nextNode);
                this.firstChild === oldChildWrapper && (this.firstChild_ = nodes[0]), this.lastChild === oldChildWrapper && (this.lastChild_ = nodes[nodes.length - 1]), 
                oldChildWrapper.previousSibling_ = null, oldChildWrapper.nextSibling_ = null, oldChildWrapper.parentNode_ = null;
                var oldChildNode = unwrap(oldChildWrapper);
                return oldChildNode.parentNode && originalReplaceChild.call(oldChildNode.parentNode, unwrapNodesForInsertion(this, nodes), oldChildNode), 
                oldChildWrapper;
            },
            hasChildNodes: function() {
                return null === this.firstChild;
            },
            get parentNode() {
                return void 0 !== this.parentNode_ ? this.parentNode_ : wrap(this.impl.parentNode);
            },
            get firstChild() {
                return void 0 !== this.firstChild_ ? this.firstChild_ : wrap(this.impl.firstChild);
            },
            get lastChild() {
                return void 0 !== this.lastChild_ ? this.lastChild_ : wrap(this.impl.lastChild);
            },
            get nextSibling() {
                return void 0 !== this.nextSibling_ ? this.nextSibling_ : wrap(this.impl.nextSibling);
            },
            get previousSibling() {
                return void 0 !== this.previousSibling_ ? this.previousSibling_ : wrap(this.impl.previousSibling);
            },
            get parentElement() {
                for (var p = this.parentNode; p && p.nodeType !== Node.ELEMENT_NODE; ) p = p.parentNode;
                return p;
            },
            get textContent() {
                for (var s = "", child = this.firstChild; child; child = child.nextSibling) s += child.textContent;
                return s;
            },
            set textContent(textContent) {
                if (removeAllChildNodes(this), this.invalidateShadowRenderer(), "" !== textContent) {
                    var textNode = this.impl.ownerDocument.createTextNode(textContent);
                    this.appendChild(textNode);
                }
            },
            get childNodes() {
                for (var wrapperList = new NodeList(), i = 0, child = this.firstChild; child; child = child.nextSibling) wrapperList[i++] = child;
                return wrapperList.length = i, wrapperList;
            },
            cloneNode: function(deep) {
                if (!this.invalidateShadowRenderer()) return wrap(this.impl.cloneNode(deep));
                var clone = wrap(this.impl.cloneNode(!1));
                if (deep) for (var child = this.firstChild; child; child = child.nextSibling) clone.appendChild(child.cloneNode(!0));
                return clone;
            },
            contains: function(child) {
                if (!child) return !1;
                if (child === this) return !0;
                var parentNode = child.parentNode;
                return parentNode ? this.contains(parentNode) : !1;
            },
            compareDocumentPosition: function(otherNode) {
                return originalCompareDocumentPosition.call(this.impl, unwrap(otherNode));
            }
        }), defineWrapGetter(Node, "ownerDocument"), registerWrapper(OriginalNode, Node, document.createDocumentFragment()), 
        delete Node.prototype.querySelector, delete Node.prototype.querySelectorAll, Node.prototype = mixin(Object.create(EventTarget.prototype), Node.prototype), 
        scope.wrappers.Node = Node;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function findOne(node, selector) {
            for (var m, el = node.firstElementChild; el; ) {
                if (el.matches(selector)) return el;
                if (m = findOne(el, selector)) return m;
                el = el.nextElementSibling;
            }
            return null;
        }
        function findAll(node, selector, results) {
            for (var el = node.firstElementChild; el; ) el.matches(selector) && (results[results.length++] = el), 
            findAll(el, selector, results), el = el.nextElementSibling;
            return results;
        }
        var SelectorsInterface = {
            querySelector: function(selector) {
                return findOne(this, selector);
            },
            querySelectorAll: function(selector) {
                return findAll(this, selector, new NodeList());
            }
        }, GetElementsByInterface = {
            getElementsByTagName: function(tagName) {
                return this.querySelectorAll(tagName);
            },
            getElementsByClassName: function(className) {
                return this.querySelectorAll("." + className);
            },
            getElementsByTagNameNS: function(ns, tagName) {
                if ("*" === ns) return this.getElementsByTagName(tagName);
                for (var result = new NodeList(), els = this.getElementsByTagName(tagName), i = 0, j = 0; i < els.length; i++) els[i].namespaceURI === ns && (result[j++] = els[i]);
                return result.length = j, result;
            }
        };
        scope.GetElementsByInterface = GetElementsByInterface, scope.SelectorsInterface = SelectorsInterface;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function forwardElement(node) {
            for (;node && node.nodeType !== Node.ELEMENT_NODE; ) node = node.nextSibling;
            return node;
        }
        function backwardsElement(node) {
            for (;node && node.nodeType !== Node.ELEMENT_NODE; ) node = node.previousSibling;
            return node;
        }
        var NodeList = scope.wrappers.NodeList, ParentNodeInterface = {
            get firstElementChild() {
                return forwardElement(this.firstChild);
            },
            get lastElementChild() {
                return backwardsElement(this.lastChild);
            },
            get childElementCount() {
                for (var count = 0, child = this.firstElementChild; child; child = child.nextElementSibling) count++;
                return count;
            },
            get children() {
                for (var wrapperList = new NodeList(), i = 0, child = this.firstElementChild; child; child = child.nextElementSibling) wrapperList[i++] = child;
                return wrapperList.length = i, wrapperList;
            }
        }, ChildNodeInterface = {
            get nextElementSibling() {
                return forwardElement(this.nextSibling);
            },
            get previousElementSibling() {
                return backwardsElement(this.nextSibling);
            }
        };
        scope.ChildNodeInterface = ChildNodeInterface, scope.ParentNodeInterface = ParentNodeInterface;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function CharacterData(node) {
            Node.call(this, node);
        }
        var ChildNodeInterface = scope.ChildNodeInterface, Node = scope.wrappers.Node, mixin = scope.mixin, registerWrapper = scope.registerWrapper, OriginalCharacterData = window.CharacterData;
        CharacterData.prototype = Object.create(Node.prototype), mixin(CharacterData.prototype, {
            get textContent() {
                return this.data;
            },
            set textContent(value) {
                this.data = value;
            }
        }), mixin(CharacterData.prototype, ChildNodeInterface), registerWrapper(OriginalCharacterData, CharacterData, document.createTextNode("")), 
        scope.wrappers.CharacterData = CharacterData;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function Element(node) {
            Node.call(this, node);
        }
        var ChildNodeInterface = scope.ChildNodeInterface, GetElementsByInterface = scope.GetElementsByInterface, Node = scope.wrappers.Node, ParentNodeInterface = scope.ParentNodeInterface, SelectorsInterface = scope.SelectorsInterface;
        scope.addWrapNodeListMethod;
        var mixin = scope.mixin, registerWrapper = scope.registerWrapper, wrappers = scope.wrappers, shadowRootTable = new SideTable(), OriginalElement = window.Element, originalMatches = OriginalElement.prototype.matches || OriginalElement.prototype.mozMatchesSelector || OriginalElement.prototype.msMatchesSelector || OriginalElement.prototype.webkitMatchesSelector;
        Element.prototype = Object.create(Node.prototype), mixin(Element.prototype, {
            createShadowRoot: function() {
                var newShadowRoot = new wrappers.ShadowRoot(this);
                return shadowRootTable.set(this, newShadowRoot), scope.getRendererForHost(this), 
                this.invalidateShadowRenderer(!0), newShadowRoot;
            },
            get shadowRoot() {
                return shadowRootTable.get(this) || null;
            },
            setAttribute: function(name, value) {
                this.impl.setAttribute(name, value), this.invalidateShadowRenderer();
            },
            matches: function(selector) {
                return originalMatches.call(this.impl, selector);
            }
        }), OriginalElement.prototype.webkitCreateShadowRoot && (Element.prototype.webkitCreateShadowRoot = Element.prototype.createShadowRoot), 
        mixin(Element.prototype, ChildNodeInterface), mixin(Element.prototype, GetElementsByInterface), 
        mixin(Element.prototype, ParentNodeInterface), mixin(Element.prototype, SelectorsInterface), 
        registerWrapper(OriginalElement, Element), scope.wrappers.Element = Element;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function escapeReplace(c) {
            switch (c) {
              case "&":
                return "&amp;";

              case "<":
                return "&lt;";

              case '"':
                return "&quot;";
            }
        }
        function escape(s) {
            return s.replace(escapeRegExp, escapeReplace);
        }
        function getOuterHTML(node) {
            switch (node.nodeType) {
              case Node.ELEMENT_NODE:
                for (var attr, tagName = node.tagName.toLowerCase(), s = "<" + tagName, attrs = node.attributes, i = 0; attr = attrs[i]; i++) s += " " + attr.name + '="' + escape(attr.value) + '"';
                return s += ">", voidElements[tagName] ? s : s + getInnerHTML(node) + "</" + tagName + ">";

              case Node.TEXT_NODE:
                return escape(node.nodeValue);

              case Node.COMMENT_NODE:
                return "<!--" + escape(node.nodeValue) + "-->";

              default:
                throw console.error(node), new Error("not implemented");
            }
        }
        function getInnerHTML(node) {
            for (var s = "", child = node.firstChild; child; child = child.nextSibling) s += getOuterHTML(child);
            return s;
        }
        function setInnerHTML(node, value, opt_tagName) {
            var tagName = opt_tagName || "div";
            node.textContent = "";
            var tempElement = unwrap(node.ownerDocument.createElement(tagName));
            tempElement.innerHTML = value;
            for (var firstChild; firstChild = tempElement.firstChild; ) node.appendChild(wrap(firstChild));
        }
        function HTMLElement(node) {
            Element.call(this, node);
        }
        function getterRequiresRendering(name) {
            defineGetter(HTMLElement, name, function() {
                return scope.renderAllPending(), this.impl[name];
            });
        }
        function methodRequiresRendering(name) {
            Object.defineProperty(HTMLElement.prototype, name, {
                value: function() {
                    return scope.renderAllPending(), this.impl[name].apply(this.impl, arguments);
                },
                configurable: !0,
                enumerable: !0
            });
        }
        var Element = scope.wrappers.Element, defineGetter = scope.defineGetter, mixin = scope.mixin, registerWrapper = scope.registerWrapper, unwrap = scope.unwrap, wrap = scope.wrap, escapeRegExp = /&|<|"/g, voidElements = {
            area: !0,
            base: !0,
            br: !0,
            col: !0,
            command: !0,
            embed: !0,
            hr: !0,
            img: !0,
            input: !0,
            keygen: !0,
            link: !0,
            meta: !0,
            param: !0,
            source: !0,
            track: !0,
            wbr: !0
        }, OriginalHTMLElement = window.HTMLElement;
        HTMLElement.prototype = Object.create(Element.prototype), mixin(HTMLElement.prototype, {
            get innerHTML() {
                return getInnerHTML(this);
            },
            set innerHTML(value) {
                setInnerHTML(this, value, this.tagName);
            },
            get outerHTML() {
                return getOuterHTML(this);
            },
            set outerHTML(value) {
                if (this.invalidateShadowRenderer()) throw new Error("not implemented");
                this.impl.outerHTML = value;
            }
        }), [ "clientHeight", "clientLeft", "clientTop", "clientWidth", "offsetHeight", "offsetLeft", "offsetTop", "offsetWidth", "scrollHeight", "scrollLeft", "scrollTop", "scrollWidth" ].forEach(getterRequiresRendering), 
        [ "getBoundingClientRect", "getClientRects", "scrollIntoView" ].forEach(methodRequiresRendering), 
        registerWrapper(OriginalHTMLElement, HTMLElement, document.createElement("b")), 
        scope.wrappers.HTMLElement = HTMLElement, scope.getInnerHTML = getInnerHTML, scope.setInnerHTML = setInnerHTML;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function HTMLContentElement(node) {
            HTMLElement.call(this, node);
        }
        var HTMLElement = scope.wrappers.HTMLElement, mixin = scope.mixin, registerWrapper = scope.registerWrapper, OriginalHTMLContentElement = window.HTMLContentElement;
        HTMLContentElement.prototype = Object.create(HTMLElement.prototype), mixin(HTMLContentElement.prototype, {
            get select() {
                return this.getAttribute("select");
            },
            set select(value) {
                this.setAttribute("select", value);
            },
            setAttribute: function(n, v) {
                HTMLElement.prototype.setAttribute.call(this, n, v), "select" === String(n).toLowerCase() && this.invalidateShadowRenderer(!0);
            }
        }), OriginalHTMLContentElement && registerWrapper(OriginalHTMLContentElement, HTMLContentElement), 
        scope.wrappers.HTMLContentElement = HTMLContentElement;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function HTMLShadowElement(node) {
            HTMLElement.call(this, node), this.olderShadowRoot_ = null;
        }
        var HTMLElement = scope.wrappers.HTMLElement, mixin = scope.mixin, registerWrapper = scope.registerWrapper, OriginalHTMLShadowElement = window.HTMLShadowElement;
        HTMLShadowElement.prototype = Object.create(HTMLElement.prototype), mixin(HTMLShadowElement.prototype, {
            get olderShadowRoot() {
                return this.olderShadowRoot_;
            },
            invalidateShadowRenderer: function() {
                HTMLElement.prototype.invalidateShadowRenderer.call(this, !0);
            }
        }), OriginalHTMLShadowElement && registerWrapper(OriginalHTMLShadowElement, HTMLShadowElement), 
        scope.wrappers.HTMLShadowElement = HTMLShadowElement;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function getTemplateContentsOwner(doc) {
            if (!doc.defaultView) return doc;
            var d = templateContentsOwnerTable.get(doc);
            if (!d) {
                for (d = doc.implementation.createHTMLDocument(""); d.lastChild; ) d.removeChild(d.lastChild);
                templateContentsOwnerTable.set(doc, d);
            }
            return d;
        }
        function extractContent(templateElement) {
            for (var child, doc = getTemplateContentsOwner(templateElement.ownerDocument), df = doc.createDocumentFragment(); child = templateElement.firstChild; ) df.appendChild(child);
            return df;
        }
        function HTMLTemplateElement(node) {
            HTMLElement.call(this, node);
        }
        var HTMLElement = scope.wrappers.HTMLElement, getInnerHTML = scope.getInnerHTML, mixin = scope.mixin, registerWrapper = scope.registerWrapper, setInnerHTML = scope.setInnerHTML, wrap = scope.wrap, contentTable = new SideTable(), templateContentsOwnerTable = new SideTable(), OriginalHTMLTemplateElement = window.HTMLTemplateElement;
        HTMLTemplateElement.prototype = Object.create(HTMLElement.prototype), mixin(HTMLTemplateElement.prototype, {
            get content() {
                if (OriginalHTMLTemplateElement) return wrap(this.impl.content);
                var content = contentTable.get(this);
                return content || (content = extractContent(this), contentTable.set(this, content)), 
                content;
            },
            get innerHTML() {
                return getInnerHTML(this.content);
            },
            set innerHTML(value) {
                setInnerHTML(this.content, value), this.invalidateShadowRenderer();
            }
        }), OriginalHTMLTemplateElement && registerWrapper(OriginalHTMLTemplateElement, HTMLTemplateElement), 
        scope.wrappers.HTMLTemplateElement = HTMLTemplateElement;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function HTMLUnknownElement(node) {
            switch (node.localName) {
              case "content":
                return new HTMLContentElement(node);

              case "shadow":
                return new HTMLShadowElement(node);

              case "template":
                return new HTMLTemplateElement(node);
            }
            HTMLElement.call(this, node);
        }
        var HTMLContentElement = scope.wrappers.HTMLContentElement, HTMLElement = scope.wrappers.HTMLElement, HTMLShadowElement = scope.wrappers.HTMLShadowElement, HTMLTemplateElement = scope.wrappers.HTMLTemplateElement;
        scope.mixin;
        var registerWrapper = scope.registerWrapper, OriginalHTMLUnknownElement = window.HTMLUnknownElement;
        HTMLUnknownElement.prototype = Object.create(HTMLElement.prototype), registerWrapper(OriginalHTMLUnknownElement, HTMLUnknownElement), 
        scope.wrappers.HTMLUnknownElement = HTMLUnknownElement;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        var GetElementsByInterface = scope.GetElementsByInterface, ParentNodeInterface = scope.ParentNodeInterface, SelectorsInterface = scope.SelectorsInterface, mixin = scope.mixin, registerObject = scope.registerObject, DocumentFragment = registerObject(document.createDocumentFragment());
        mixin(DocumentFragment.prototype, ParentNodeInterface), mixin(DocumentFragment.prototype, SelectorsInterface), 
        mixin(DocumentFragment.prototype, GetElementsByInterface);
        var Text = registerObject(document.createTextNode("")), Comment = registerObject(document.createComment(""));
        scope.wrappers.Comment = Comment, scope.wrappers.DocumentFragment = DocumentFragment, 
        scope.wrappers.Text = Text;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function ShadowRoot(hostWrapper) {
            var node = unwrap(hostWrapper.impl.ownerDocument.createDocumentFragment());
            DocumentFragment.call(this, node), rewrap(node, this);
            var oldShadowRoot = hostWrapper.shadowRoot;
            scope.nextOlderShadowTreeTable.set(this, oldShadowRoot), shadowHostTable.set(this, hostWrapper);
        }
        var DocumentFragment = scope.wrappers.DocumentFragment, elementFromPoint = scope.elementFromPoint, getInnerHTML = scope.getInnerHTML, mixin = scope.mixin, rewrap = scope.rewrap, setInnerHTML = scope.setInnerHTML, unwrap = scope.unwrap, shadowHostTable = new SideTable();
        ShadowRoot.prototype = Object.create(DocumentFragment.prototype), mixin(ShadowRoot.prototype, {
            get innerHTML() {
                return getInnerHTML(this);
            },
            set innerHTML(value) {
                setInnerHTML(this, value), this.invalidateShadowRenderer();
            },
            invalidateShadowRenderer: function() {
                return shadowHostTable.get(this).invalidateShadowRenderer();
            },
            elementFromPoint: function(x, y) {
                return elementFromPoint(this, this.ownerDocument, x, y);
            },
            getElementById: function(id) {
                return this.querySelector("#" + id);
            }
        }), scope.wrappers.ShadowRoot = ShadowRoot, scope.getHostForShadowRoot = function(node) {
            return shadowHostTable.get(node);
        };
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function updateWrapperUpAndSideways(wrapper) {
            wrapper.previousSibling_ = wrapper.previousSibling, wrapper.nextSibling_ = wrapper.nextSibling, 
            wrapper.parentNode_ = wrapper.parentNode;
        }
        function updateWrapperDown(wrapper) {
            wrapper.firstChild_ = wrapper.firstChild, wrapper.lastChild_ = wrapper.lastChild;
        }
        function updateAllChildNodes(parentNodeWrapper) {
            assert(parentNodeWrapper instanceof Node);
            for (var childWrapper = parentNodeWrapper.firstChild; childWrapper; childWrapper = childWrapper.nextSibling) updateWrapperUpAndSideways(childWrapper);
            updateWrapperDown(parentNodeWrapper);
        }
        function removeAllChildNodes(parentNodeWrapper) {
            var parentNode = unwrap(parentNodeWrapper);
            updateAllChildNodes(parentNodeWrapper), parentNode.textContent = "";
        }
        function appendChild(parentNodeWrapper, childWrapper) {
            var parentNode = unwrap(parentNodeWrapper), child = unwrap(childWrapper);
            child.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? updateAllChildNodes(childWrapper) : (remove(childWrapper), 
            updateWrapperUpAndSideways(childWrapper)), parentNodeWrapper.lastChild_ = parentNodeWrapper.lastChild, 
            parentNodeWrapper.lastChild === parentNodeWrapper.firstChild && (parentNodeWrapper.firstChild_ = parentNodeWrapper.firstChild);
            var lastChildWrapper = wrap(parentNode.lastChild);
            lastChildWrapper && (lastChildWrapper.nextSibling_ = lastChildWrapper.nextSibling), 
            parentNode.appendChild(child);
        }
        function removeChild(parentNodeWrapper, childWrapper) {
            var parentNode = unwrap(parentNodeWrapper), child = unwrap(childWrapper);
            updateWrapperUpAndSideways(childWrapper), childWrapper.previousSibling && (childWrapper.previousSibling.nextSibling_ = childWrapper), 
            childWrapper.nextSibling && (childWrapper.nextSibling.previousSibling_ = childWrapper), 
            parentNodeWrapper.lastChild === childWrapper && (parentNodeWrapper.lastChild_ = childWrapper), 
            parentNodeWrapper.firstChild === childWrapper && (parentNodeWrapper.firstChild_ = childWrapper), 
            parentNode.removeChild(child);
        }
        function remove(nodeWrapper) {
            var node = unwrap(nodeWrapper), parentNode = node.parentNode;
            parentNode && removeChild(wrap(parentNode), nodeWrapper);
        }
        function distributeChildToInsertionPoint(child, insertionPoint) {
            getDistributedChildNodes(insertionPoint).push(child), assignToInsertionPoint(child, insertionPoint);
            var eventParents = eventParentsTable.get(child);
            eventParents || eventParentsTable.set(child, eventParents = []), eventParents.push(insertionPoint);
        }
        function resetDistributedChildNodes(insertionPoint) {
            distributedChildNodesTable.set(insertionPoint, []);
        }
        function getDistributedChildNodes(insertionPoint) {
            return distributedChildNodesTable.get(insertionPoint);
        }
        function getChildNodesSnapshot(node) {
            for (var result = [], i = 0, child = node.firstChild; child; child = child.nextSibling) result[i++] = child;
            return result;
        }
        function visit(tree, predicate, visitor) {
            for (var nodes = getChildNodesSnapshot(tree), i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                if (predicate(node)) {
                    if (visitor(node) === !1) return;
                } else visit(node, predicate, visitor);
            }
        }
        function distribute(tree, pool) {
            var anyRemoved = !1;
            return visit(tree, isActiveInsertionPoint, function(insertionPoint) {
                resetDistributedChildNodes(insertionPoint);
                for (var i = 0; i < pool.length; i++) {
                    var node = pool[i];
                    void 0 !== node && matchesCriteria(node, insertionPoint) && (distributeChildToInsertionPoint(node, insertionPoint), 
                    pool[i] = void 0, anyRemoved = !0);
                }
            }), anyRemoved ? pool.filter(function(item) {
                return void 0 !== item;
            }) : pool;
        }
        function oneOf(object, propertyNames) {
            for (var i = 0; i < propertyNames.length; i++) if (propertyNames[i] in object) return propertyNames[i];
        }
        function matchesCriteria(node, point) {
            var select = point.getAttribute("select");
            if (!select) return !0;
            if (select = select.trim(), !select) return !0;
            if (node.nodeType !== Node.ELEMENT_NODE) return !1;
            if (!selectorMatchRegExp.test(select)) return !1;
            if (":" === select[0] && !allowedPseudoRegExp.test(select)) return !1;
            try {
                return node.matches(select);
            } catch (ex) {
                return !1;
            }
        }
        function renderAllPending() {
            renderTimer = null, pendingDirtyRenderers.forEach(function(owner) {
                owner.render();
            }), pendingDirtyRenderers = [];
        }
        function ShadowRenderer(host) {
            this.host = host, this.dirty = !1, this.associateNode(host);
        }
        function getRendererForHost(host) {
            var renderer = rendererForHostTable.get(host);
            return renderer || (renderer = new ShadowRenderer(host), rendererForHostTable.set(host, renderer)), 
            renderer;
        }
        function isInsertionPoint(node) {
            return "content" === node.localName;
        }
        function isActiveInsertionPoint(node) {
            return "content" === node.localName;
        }
        function isShadowInsertionPoint(node) {
            return "shadow" === node.localName;
        }
        function isActiveShadowInsertionPoint(node) {
            return "shadow" === node.localName;
        }
        function isShadowHost(shadowHost) {
            return !!shadowHost.shadowRoot;
        }
        function getNextOlderTree(tree) {
            return nextOlderShadowTreeTable.get(tree);
        }
        function getShadowTrees(host) {
            for (var trees = [], tree = host.shadowRoot; tree; tree = nextOlderShadowTreeTable.get(tree)) trees.push(tree);
            return trees;
        }
        function assignToInsertionPoint(tree, point) {
            insertionParentTable.set(tree, point);
        }
        function render(host) {
            new ShadowRenderer(host).render();
        }
        var HTMLContentElement = scope.wrappers.HTMLContentElement, Node = scope.wrappers.Node, assert = scope.assert;
        scope.mixin;
        var renderTimer, unwrap = scope.unwrap, wrap = scope.wrap, distributedChildNodesTable = new SideTable(), eventParentsTable = new SideTable(), insertionParentTable = new SideTable(), nextOlderShadowTreeTable = new SideTable(), rendererForHostTable = new SideTable(), shadowDOMRendererTable = new SideTable(), selectorMatchRegExp = /^[*.:#[a-zA-Z_|]/, allowedPseudoRegExp = new RegExp("^:(" + [ "link", "visited", "target", "enabled", "disabled", "checked", "indeterminate", "nth-child", "nth-last-child", "nth-of-type", "nth-last-of-type", "first-child", "last-child", "first-of-type", "last-of-type", "only-of-type" ].join("|") + ")"), request = oneOf(window, [ "requestAnimationFrame", "mozRequestAnimationFrame", "webkitRequestAnimationFrame", "setTimeout" ]), pendingDirtyRenderers = [];
        ShadowRenderer.prototype = {
            render: function() {
                if (this.dirty) {
                    var host = this.host;
                    this.treeComposition();
                    var shadowDOM = host.shadowRoot;
                    if (shadowDOM) {
                        this.removeAllChildNodes(this.host);
                        var shadowDOMChildNodes = getChildNodesSnapshot(shadowDOM);
                        shadowDOMChildNodes.forEach(function(node) {
                            this.renderNode(host, shadowDOM, node, !1);
                        }, this), this.dirty = !1;
                    }
                }
            },
            invalidate: function() {
                if (!this.dirty) {
                    if (this.dirty = !0, pendingDirtyRenderers.push(this), renderTimer) return;
                    renderTimer = window[request](renderAllPending, 0);
                }
            },
            renderNode: function(visualParent, tree, node, isNested) {
                if (isShadowHost(node)) {
                    this.appendChild(visualParent, node);
                    var renderer = getRendererForHost(node);
                    renderer.dirty = !0, renderer.render();
                } else isInsertionPoint(node) ? this.renderInsertionPoint(visualParent, tree, node, isNested) : isShadowInsertionPoint(node) ? this.renderShadowInsertionPoint(visualParent, tree, node) : this.renderAsAnyDomTree(visualParent, tree, node, isNested);
            },
            renderAsAnyDomTree: function(visualParent, tree, child, isNested) {
                if (this.appendChild(visualParent, child), isShadowHost(child)) render(child); else {
                    var parent = child, logicalChildNodes = getChildNodesSnapshot(parent);
                    logicalChildNodes.forEach(function(node) {
                        this.renderNode(parent, tree, node, isNested);
                    }, this);
                }
            },
            renderInsertionPoint: function(visualParent, tree, insertionPoint, isNested) {
                var distributedChildNodes = getDistributedChildNodes(insertionPoint);
                distributedChildNodes.length ? (this.removeAllChildNodes(insertionPoint), distributedChildNodes.forEach(function(child) {
                    isInsertionPoint(child) && isNested ? this.renderInsertionPoint(visualParent, tree, child, isNested) : this.renderAsAnyDomTree(visualParent, tree, child, isNested);
                }, this)) : this.renderFallbackContent(visualParent, insertionPoint), this.remove(insertionPoint);
            },
            renderShadowInsertionPoint: function(visualParent, tree, shadowInsertionPoint) {
                var nextOlderTree = getNextOlderTree(tree);
                if (nextOlderTree) {
                    assignToInsertionPoint(nextOlderTree, shadowInsertionPoint), shadowInsertionPoint.olderShadowRoot_ = nextOlderTree, 
                    this.remove(shadowInsertionPoint);
                    var shadowDOMChildNodes = getChildNodesSnapshot(nextOlderTree);
                    shadowDOMChildNodes.forEach(function(node) {
                        this.renderNode(visualParent, nextOlderTree, node, !0);
                    }, this);
                } else this.renderFallbackContent(visualParent, shadowInsertionPoint);
            },
            renderFallbackContent: function(visualParent, fallbackHost) {
                var logicalChildNodes = getChildNodesSnapshot(fallbackHost);
                logicalChildNodes.forEach(function(node) {
                    this.appendChild(visualParent, node);
                }, this);
            },
            treeComposition: function() {
                var shadowHost = this.host, tree = shadowHost.shadowRoot, pool = [], shadowHostChildNodes = getChildNodesSnapshot(shadowHost);
                shadowHostChildNodes.forEach(function(child) {
                    if (isInsertionPoint(child)) {
                        var reprojected = getDistributedChildNodes(child);
                        reprojected && reprojected.length || (reprojected = getChildNodesSnapshot(child)), 
                        pool.push.apply(pool, reprojected);
                    } else pool.push(child);
                });
                for (var shadowInsertionPoint, point; tree; ) {
                    if (shadowInsertionPoint = void 0, visit(tree, isActiveShadowInsertionPoint, function(point) {
                        return shadowInsertionPoint = point, !1;
                    }), point = shadowInsertionPoint, pool = distribute(tree, pool), point) {
                        var nextOlderTree = getNextOlderTree(tree);
                        if (nextOlderTree) {
                            tree = nextOlderTree, assignToInsertionPoint(tree, point);
                            continue;
                        }
                        break;
                    }
                    break;
                }
            },
            appendChild: function(parent, child) {
                appendChild(parent, child), this.associateNode(child);
            },
            remove: function(node) {
                remove(node), this.associateNode(node);
            },
            removeAllChildNodes: function(parent) {
                removeAllChildNodes(parent);
            },
            associateNode: function(node) {
                shadowDOMRendererTable.set(node, this);
            }
        }, Node.prototype.invalidateShadowRenderer = function(force) {
            var renderer = shadowDOMRendererTable.get(this);
            if (!renderer) return !1;
            var p;
            return (force || this.shadowRoot || (p = this.parentNode) && (p.shadowRoot || p instanceof ShadowRoot)) && renderer.invalidate(), 
            !0;
        }, HTMLContentElement.prototype.getDistributedNodes = function() {
            return renderAllPending(), getDistributedChildNodes(this);
        }, scope.eventParentsTable = eventParentsTable, scope.getRendererForHost = getRendererForHost, 
        scope.getShadowTrees = getShadowTrees, scope.nextOlderShadowTreeTable = nextOlderShadowTreeTable, 
        scope.renderAllPending = renderAllPending, scope.insertionParentTable = insertionParentTable, 
        scope.visual = {
            removeAllChildNodes: removeAllChildNodes,
            appendChild: appendChild,
            removeChild: removeChild
        };
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function Document(node) {
            Node.call(this, node);
        }
        function wrapMethod(name) {
            var original = document[name];
            Document.prototype[name] = function() {
                return wrap(original.apply(this.impl, arguments));
            };
        }
        function adoptSubtree(node, doc) {
            node.shadowRoot && doc.adoptNode(node.shadowRoot), node instanceof ShadowRoot && adoptOlderShadowRoots(node, doc);
            for (var child = node.firstChild; child; child = child.nextSibling) adoptSubtree(child, doc);
        }
        function adoptOlderShadowRoots(shadowRoot, doc) {
            var oldShadowRoot = scope.nextOlderShadowTreeTable.get(shadowRoot);
            oldShadowRoot && doc.adoptNode(oldShadowRoot);
        }
        function DOMImplementation(impl) {
            this.impl = impl;
        }
        function wrapImplMethod(constructor, name) {
            var original = document.implementation[name];
            constructor.prototype[name] = function() {
                return wrap(original.apply(this.impl, arguments));
            };
        }
        function forwardImplMethod(constructor, name) {
            var original = document.implementation[name];
            constructor.prototype[name] = function() {
                return original.apply(this.impl, arguments);
            };
        }
        var GetElementsByInterface = scope.GetElementsByInterface, Node = scope.wrappers.Node, ParentNodeInterface = scope.ParentNodeInterface, SelectorsInterface = scope.SelectorsInterface, ShadowRoot = scope.wrappers.ShadowRoot, defineWrapGetter = scope.defineWrapGetter, elementFromPoint = scope.elementFromPoint, forwardMethodsToWrapper = scope.forwardMethodsToWrapper, mixin = scope.mixin, registerWrapper = scope.registerWrapper, unwrap = scope.unwrap, wrap = scope.wrap, wrapEventTargetMethods = scope.wrapEventTargetMethods;
        scope.wrapNodeList;
        var implementationTable = new SideTable();
        Document.prototype = Object.create(Node.prototype), defineWrapGetter(Document, "documentElement"), 
        defineWrapGetter(Document, "body"), defineWrapGetter(Document, "head"), [ "getElementById", "createElement", "createElementNS", "createTextNode", "createDocumentFragment", "createEvent", "createEventNS" ].forEach(wrapMethod);
        var originalAdoptNode = document.adoptNode, originalWrite = document.write;
        mixin(Document.prototype, {
            adoptNode: function(node) {
                return node.parentNode && node.parentNode.removeChild(node), originalAdoptNode.call(this.impl, unwrap(node)), 
                adoptSubtree(node, this), node;
            },
            elementFromPoint: function(x, y) {
                return elementFromPoint(this, this, x, y);
            },
            write: function(s) {
                for (var all = this.querySelectorAll("*"), last = all[all.length - 1]; last.nextSibling; ) last = last.nextSibling;
                var p = last.parentNode;
                p.lastChild_ = void 0, last.nextSibling_ = void 0, originalWrite.call(this.impl, s);
            }
        }), forwardMethodsToWrapper([ window.HTMLBodyElement, window.HTMLDocument || window.Document, window.HTMLHeadElement ], [ "appendChild", "compareDocumentPosition", "getElementsByClassName", "getElementsByTagName", "getElementsByTagNameNS", "insertBefore", "querySelector", "querySelectorAll", "removeChild", "replaceChild" ]), 
        forwardMethodsToWrapper([ window.HTMLDocument || window.Document ], [ "adoptNode", "createDocumentFragment", "createElement", "createElementNS", "createEvent", "createEventNS", "createTextNode", "elementFromPoint", "getElementById", "write" ]), 
        mixin(Document.prototype, GetElementsByInterface), mixin(Document.prototype, ParentNodeInterface), 
        mixin(Document.prototype, SelectorsInterface), mixin(Document.prototype, {
            get implementation() {
                var implementation = implementationTable.get(this);
                return implementation ? implementation : (implementation = new DOMImplementation(unwrap(this).implementation), 
                implementationTable.set(this, implementation), implementation);
            }
        }), registerWrapper(window.Document, Document, document.implementation.createHTMLDocument("")), 
        window.HTMLDocument && registerWrapper(window.HTMLDocument, Document), wrapEventTargetMethods([ window.HTMLBodyElement, window.HTMLDocument || window.Document, window.HTMLHeadElement ]), 
        wrapImplMethod(DOMImplementation, "createDocumentType"), wrapImplMethod(DOMImplementation, "createDocument"), 
        wrapImplMethod(DOMImplementation, "createHTMLDocument"), forwardImplMethod(DOMImplementation, "hasFeature"), 
        registerWrapper(window.DOMImplementation, DOMImplementation), forwardMethodsToWrapper([ window.DOMImplementation ], [ "createDocumentType", "createDocument", "createHTMLDocument", "hasFeature" ]), 
        scope.wrappers.Document = Document, scope.wrappers.DOMImplementation = DOMImplementation;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function Window(impl) {
            EventTarget.call(this, impl);
        }
        var EventTarget = scope.wrappers.EventTarget, mixin = scope.mixin, registerWrapper = scope.registerWrapper, unwrap = scope.unwrap, unwrapIfNeeded = scope.unwrapIfNeeded, wrap = scope.wrap, OriginalWindow = window.Window;
        Window.prototype = Object.create(EventTarget.prototype);
        var originalGetComputedStyle = window.getComputedStyle;
        OriginalWindow.prototype.getComputedStyle = function(el, pseudo) {
            return originalGetComputedStyle.call(this || window, unwrapIfNeeded(el), pseudo);
        }, [ "addEventListener", "removeEventListener", "dispatchEvent" ].forEach(function(name) {
            OriginalWindow.prototype[name] = function() {
                var w = wrap(this || window);
                return w[name].apply(w, arguments);
            };
        }), mixin(Window.prototype, {
            getComputedStyle: function(el, pseudo) {
                return originalGetComputedStyle.call(unwrap(this), unwrapIfNeeded(el), pseudo);
            }
        }), registerWrapper(OriginalWindow, Window), scope.wrappers.Window = Window;
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function MutationRecord(impl) {
            this.impl = impl;
        }
        function wrapRecord(record) {
            return new MutationRecord(record);
        }
        function wrapRecords(records) {
            return records.map(wrapRecord);
        }
        function MutationObserver(callback) {
            var self = this;
            this.impl = new OriginalMutationObserver(function(mutations) {
                callback.call(self, wrapRecords(mutations), self);
            });
        }
        var defineGetter = scope.defineGetter, defineWrapGetter = scope.defineWrapGetter, registerWrapper = scope.registerWrapper, unwrapIfNeeded = scope.unwrapIfNeeded, wrapNodeList = scope.wrapNodeList;
        scope.wrappers;
        var OriginalMutationObserver = window.MutationObserver || window.WebKitMutationObserver;
        if (OriginalMutationObserver) {
            var OriginalMutationRecord = window.MutationRecord;
            MutationRecord.prototype = {
                get addedNodes() {
                    return wrapNodeList(this.impl.addedNodes);
                },
                get removedNodes() {
                    return wrapNodeList(this.impl.removedNodes);
                }
            }, [ "target", "previousSibling", "nextSibling" ].forEach(function(name) {
                defineWrapGetter(MutationRecord, name);
            }), [ "type", "attributeName", "attributeNamespace", "oldValue" ].forEach(function(name) {
                defineGetter(MutationRecord, name, function() {
                    return this.impl[name];
                });
            }), OriginalMutationRecord && registerWrapper(OriginalMutationRecord, MutationRecord), 
            window.Node, MutationObserver.prototype = {
                observe: function(target, options) {
                    this.impl.observe(unwrapIfNeeded(target), options);
                },
                disconnect: function() {
                    this.impl.disconnect();
                },
                takeRecords: function() {
                    return wrapRecords(this.impl.takeRecords());
                }
            }, scope.wrappers.MutationObserver = MutationObserver, scope.wrappers.MutationRecord = MutationRecord;
        }
    }(this.ShadowDOMPolyfill), function(scope) {
        
        function overrideConstructor(tagName) {
            var nativeConstructorName = elements[tagName], nativeConstructor = window[nativeConstructorName];
            if (nativeConstructor) {
                var element = document.createElement(tagName), wrapperConstructor = element.constructor;
                window[nativeConstructorName] = wrapperConstructor;
            }
        }
        scope.isWrapperFor;
        var elements = {
            a: "HTMLAnchorElement",
            applet: "HTMLAppletElement",
            area: "HTMLAreaElement",
            audio: "HTMLAudioElement",
            br: "HTMLBRElement",
            base: "HTMLBaseElement",
            body: "HTMLBodyElement",
            button: "HTMLButtonElement",
            canvas: "HTMLCanvasElement",
            dl: "HTMLDListElement",
            datalist: "HTMLDataListElement",
            dir: "HTMLDirectoryElement",
            div: "HTMLDivElement",
            embed: "HTMLEmbedElement",
            fieldset: "HTMLFieldSetElement",
            font: "HTMLFontElement",
            form: "HTMLFormElement",
            frame: "HTMLFrameElement",
            frameset: "HTMLFrameSetElement",
            hr: "HTMLHRElement",
            head: "HTMLHeadElement",
            h1: "HTMLHeadingElement",
            html: "HTMLHtmlElement",
            iframe: "HTMLIFrameElement",
            input: "HTMLInputElement",
            li: "HTMLLIElement",
            label: "HTMLLabelElement",
            legend: "HTMLLegendElement",
            link: "HTMLLinkElement",
            map: "HTMLMapElement",
            menu: "HTMLMenuElement",
            menuitem: "HTMLMenuItemElement",
            meta: "HTMLMetaElement",
            meter: "HTMLMeterElement",
            del: "HTMLModElement",
            ol: "HTMLOListElement",
            object: "HTMLObjectElement",
            optgroup: "HTMLOptGroupElement",
            option: "HTMLOptionElement",
            output: "HTMLOutputElement",
            p: "HTMLParagraphElement",
            param: "HTMLParamElement",
            pre: "HTMLPreElement",
            progress: "HTMLProgressElement",
            q: "HTMLQuoteElement",
            script: "HTMLScriptElement",
            select: "HTMLSelectElement",
            source: "HTMLSourceElement",
            span: "HTMLSpanElement",
            style: "HTMLStyleElement",
            caption: "HTMLTableCaptionElement",
            col: "HTMLTableColElement",
            table: "HTMLTableElement",
            tr: "HTMLTableRowElement",
            thead: "HTMLTableSectionElement",
            tbody: "HTMLTableSectionElement",
            textarea: "HTMLTextAreaElement",
            title: "HTMLTitleElement",
            ul: "HTMLUListElement",
            video: "HTMLVideoElement"
        };
        Object.keys(elements).forEach(overrideConstructor), Object.getOwnPropertyNames(scope.wrappers).forEach(function(name) {
            window[name] = scope.wrappers[name];
        }), scope.knownElements = elements;
    }(this.ShadowDOMPolyfill), function() {
        window.wrap = function(n) {
            return n.impl ? n : ShadowDOMPolyfill.wrap(n);
        }, window.unwrap = function(n) {
            return n.impl ? ShadowDOMPolyfill.unwrap(n) : n;
        };
        var originalGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = function(n, pseudo) {
            return originalGetComputedStyle.call(window, wrap(n), pseudo);
        }, Object.defineProperties(HTMLElement.prototype, {
            webkitShadowRoot: {
                get: function() {
                    return this.shadowRoot;
                }
            }
        }), HTMLElement.prototype.webkitCreateShadowRoot = HTMLElement.prototype.createShadowRoot;
    }();
} else {
    var SideTable;
    "undefined" != typeof WeakMap && navigator.userAgent.indexOf("Firefox/") < 0 ? SideTable = WeakMap : function() {
        var defineProperty = Object.defineProperty, hasOwnProperty = Object.hasOwnProperty, counter = new Date().getTime() % 1e9;
        SideTable = function() {
            this.name = "__st" + (1e9 * Math.random() >>> 0) + (counter++ + "__");
        }, SideTable.prototype = {
            set: function(key, value) {
                defineProperty(key, this.name, {
                    value: value,
                    writable: !0
                });
            },
            get: function(key) {
                return hasOwnProperty.call(key, this.name) ? key[this.name] : void 0;
            },
            "delete": function(key) {
                this.set(key, void 0);
            }
        };
    }(), function() {
        window.templateContent = window.templateContent || function(inTemplate) {
            return inTemplate.content;
        }, window.wrap = window.unwrap = function(n) {
            return n;
        }, Object.defineProperties(HTMLElement.prototype, {
            shadowRoot: {
                get: function() {
                    return this.webkitShadowRoot;
                }
            },
            createShadowRoot: {
                value: function() {
                    return this.webkitCreateShadowRoot();
                }
            }
        }), window.templateContent = function(inTemplate) {
            if (window.HTMLTemplateElement && HTMLTemplateElement.bootstrap && HTMLTemplateElement.bootstrap(inTemplate), 
            !inTemplate.content && !inTemplate._content) {
                for (var frag = document.createDocumentFragment(); inTemplate.firstChild; ) frag.appendChild(inTemplate.firstChild);
                inTemplate._content = frag;
            }
            return inTemplate.content || inTemplate._content;
        };
    }();
}

if (function(scope) {
    function mixin(inObj) {
        for (var obj = inObj || {}, i = 1; i < arguments.length; i++) {
            var p = arguments[i];
            try {
                for (var n in p) copyProperty(n, p, obj);
            } catch (x) {}
        }
        return obj;
    }
    function copyProperty(inName, inSource, inTarget) {
        var pd = getPropertyDescriptor(inSource, inName);
        Object.defineProperty(inTarget, inName, pd);
    }
    function getPropertyDescriptor(inObject, inName) {
        if (inObject) {
            var pd = Object.getOwnPropertyDescriptor(inObject, inName);
            return pd || getPropertyDescriptor(Object.getPrototypeOf(inObject), inName);
        }
    }
    Function.prototype.bind || (Function.prototype.bind = function(scope) {
        var self = this, args = Array.prototype.slice.call(arguments, 1);
        return function() {
            var args2 = args.slice();
            return args2.push.apply(args2, arguments), self.apply(scope, args2);
        };
    }), scope.mixin = mixin;
}(window.Platform), function(scope) {
    
    function createDOM(inTagOrNode, inHTML, inAttrs) {
        var dom = "string" == typeof inTagOrNode ? document.createElement(inTagOrNode) : inTagOrNode.cloneNode(!0);
        if (dom.innerHTML = inHTML, inAttrs) for (var n in inAttrs) dom.setAttribute(n, inAttrs[n]);
        return dom;
    }
    var add = DOMTokenList.prototype.add, remove = DOMTokenList.prototype.remove;
    if (DOMTokenList.prototype.add = function() {
        for (var i = 0; i < arguments.length; i++) add.call(this, arguments[i]);
    }, DOMTokenList.prototype.remove = function() {
        for (var i = 0; i < arguments.length; i++) remove.call(this, arguments[i]);
    }, DOMTokenList.prototype.toggle = function(name, bool) {
        1 == arguments.length && (bool = !this.contains(name)), bool ? this.add(name) : this.remove(name);
    }, DOMTokenList.prototype.switch = function(oldName, newName) {
        oldName && this.remove(oldName), newName && this.add(newName);
    }, NodeList.prototype.forEach = function(cb, context) {
        Array.prototype.slice.call(this).forEach(cb, context);
    }, HTMLCollection.prototype.forEach = function(cb, context) {
        Array.prototype.slice.call(this).forEach(cb, context);
    }, !window.performance) {
        var start = Date.now();
        window.performance = {
            now: function() {
                return Date.now() - start;
            }
        };
    }
    window.requestAnimationFrame || (window.requestAnimationFrame = function() {
        var nativeRaf = window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
        return nativeRaf ? function(callback) {
            return nativeRaf(function() {
                callback(performance.now());
            });
        } : function(callback) {
            return window.setTimeout(callback, 1e3 / 60);
        };
    }()), window.cancelAnimationFrame || (window.cancelAnimationFrame = function() {
        return window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame || function(id) {
            clearTimeout(id);
        };
    }()), scope.createDOM = createDOM;
}(window.Platform), window.templateContent = window.templateContent || function(inTemplate) {
    return inTemplate.content;
}, function(scope) {
    scope = scope || (window.Inspector = {});
    var inspector;
    window.sinspect = function(inNode, inProxy) {
        inspector || (inspector = window.open("", "ShadowDOM Inspector", null, !0), inspector.document.write(inspectorHTML), 
        inspector.api = {
            shadowize: shadowize
        }), inspect(inNode || wrap(document.body), inProxy);
    };
    var inspectorHTML = [ "<!DOCTYPE html>", "<html>", "  <head>", "    <title>ShadowDOM Inspector</title>", "    <style>", "      body {", "      }", "      pre {", '        font: 9pt "Courier New", monospace;', "        line-height: 1.5em;", "      }", "      tag {", "        color: purple;", "      }", "      ul {", "         margin: 0;", "         padding: 0;", "         list-style: none;", "      }", "      li {", "         display: inline-block;", "         background-color: #f1f1f1;", "         padding: 4px 6px;", "         border-radius: 4px;", "         margin-right: 4px;", "      }", "    </style>", "  </head>", "  <body>", '    <ul id="crumbs">', "    </ul>", '    <div id="tree"></div>', "  </body>", "</html>" ].join("\n"), crumbs = [], displayCrumbs = function() {
        var d = inspector.document, cb = d.querySelector("#crumbs");
        cb.textContent = "";
        for (var c, i = 0; c = crumbs[i]; i++) {
            var a = d.createElement("a");
            a.href = "#", a.textContent = c.localName, a.idx = i, a.onclick = function(event) {
                for (var c; crumbs.length > this.idx; ) c = crumbs.pop();
                inspect(c.shadow || c, c), event.preventDefault();
            }, cb.appendChild(d.createElement("li")).appendChild(a);
        }
    }, inspect = function(inNode, inProxy) {
        var d = inspector.document;
        drillable = [];
        var proxy = inProxy || inNode;
        crumbs.push(proxy), displayCrumbs(), d.body.querySelector("#tree").innerHTML = "<pre>" + output(inNode, inNode.childNodes) + "</pre>";
    }, forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach), blacklisted = {
        STYLE: 1,
        SCRIPT: 1,
        "#comment": 1,
        TEMPLATE: 1
    }, blacklist = function(inNode) {
        return blacklisted[inNode.nodeName];
    }, output = function(inNode, inChildNodes, inIndent) {
        if (blacklist(inNode)) return "";
        var indent = inIndent || "";
        if (inNode.localName || 11 == inNode.nodeType) {
            var name = inNode.localName || "shadow-root", info = indent + describe(inNode);
            "content" == name && (inChildNodes = inNode.getDistributedNodes()), info += "<br/>";
            var ind = indent + "&nbsp;&nbsp;";
            forEach(inChildNodes, function(n) {
                info += output(n, n.childNodes, ind);
            }), info += indent, {
                br: 1
            }[name] || (info += "<tag>&lt;/" + name + "&gt;</tag>", info += "<br/>");
        } else {
            var text = inNode.textContent.trim();
            info = text ? indent + '"' + text + '"' + "<br/>" : "";
        }
        return info;
    }, drillable = [], describe = function(inNode) {
        var tag = "<tag>&lt;", name = inNode.localName || "shadow-root";
        return inNode.webkitShadowRoot || inNode.shadowRoot ? (tag += ' <button idx="' + drillable.length + '" onclick="api.shadowize.call(this)">' + name + "</button>", 
        drillable.push(inNode)) : tag += name || "shadow-root", inNode.attributes && forEach(inNode.attributes, function(a) {
            tag += " " + a.name + (a.value ? '="' + a.value + '"' : "");
        }), tag += "&gt;</tag>";
    };
    shadowize = function() {
        var idx = Number(this.attributes.idx.value), node = drillable[idx];
        node ? inspect(node.webkitShadowRoot || node.shadowRoot, node) : (console.log("bad shadowize node"), 
        console.dir(this));
    }, scope.output = output;
}(window.Inspector), function(global) {
    
    function detectObjectObserve() {
        function callback(records) {
            "splice" === records[0].type && "splice" === records[1].type && (gotSplice = !0);
        }
        if ("function" != typeof Object.observe && "function" != typeof Array.observe) return !1;
        var gotSplice = !1, test = [ 0 ];
        return Array.observe(test, callback), test[1] = 1, test.length = 0, Object.deliverChangeRecords(callback), 
        gotSplice;
    }
    function isIndex(s) {
        return +s === s >>> 0;
    }
    function toNumber(s) {
        return +s;
    }
    function isObject(obj) {
        return obj === Object(obj);
    }
    function areSameValue(left, right) {
        return left === right ? 0 !== left || 1 / left === 1 / right : numberIsNaN(left) && numberIsNaN(right) ? !0 : left !== left && right !== right;
    }
    function isPathValid(s) {
        return "string" != typeof s ? !1 : (s = s.replace(/\s/g, ""), "" == s ? !0 : "." == s[0] ? !1 : pathRegExp.test(s));
    }
    function Path(s) {
        return "" == s.trim() ? this : isIndex(s) ? (this.push(String(s)), this) : (s.split(/\./).filter(function(part) {
            return part;
        }).forEach(function(part) {
            this.push(part);
        }, this), void 0);
    }
    function dirtyCheck(observer) {
        for (var cycles = 0; MAX_DIRTY_CHECK_CYCLES > cycles && observer.check(); ) observer.report(), 
        cycles++;
    }
    function objectIsEmpty(object) {
        for (var prop in object) return !1;
        return !0;
    }
    function diffIsEmpty(diff) {
        return objectIsEmpty(diff.added) && objectIsEmpty(diff.removed) && objectIsEmpty(diff.changed);
    }
    function diffObjectFromOldObject(object, oldObject) {
        var added = {}, removed = {}, changed = {};
        for (var prop in oldObject) {
            var newValue = object[prop];
            (void 0 === newValue || newValue !== oldObject[prop]) && (prop in object ? newValue !== oldObject[prop] && (changed[prop] = newValue) : removed[prop] = void 0);
        }
        for (var prop in object) prop in oldObject || (added[prop] = object[prop]);
        return Array.isArray(object) && object.length !== oldObject.length && (changed.length = object.length), 
        {
            added: added,
            removed: removed,
            changed: changed
        };
    }
    function copyObject(object, opt_copy) {
        var copy = opt_copy || (Array.isArray(object) ? [] : {});
        for (var prop in object) copy[prop] = object[prop];
        return Array.isArray(object) && (copy.length = object.length), copy;
    }
    function Observer(callback) {
        this.callback = callback, this.reporting = !0, hasObserve && (this.boundInternalCallback = this.internalCallback.bind(this)), 
        this.valid = !0, addToAll(this), this.connect(), this.sync(!0);
    }
    function addToAll(observer) {
        collectObservers && (allObservers.push(observer), Observer._allObserversCount++);
    }
    function removeFromAll(observer) {
        if (collectObservers) for (var i = 0; i < allObservers.length; i++) if (allObservers[i] === observer) {
            allObservers[i] = void 0, Observer._allObserversCount--;
            break;
        }
    }
    function ObjectObserver(object, callback) {
        this.object = object, Observer.call(this, callback);
    }
    function ArrayObserver(array, callback) {
        if (!Array.isArray(array)) throw Error("Provided object is not an Array");
        this.object = array, Observer.call(this, callback);
    }
    function getPathValue(object, path) {
        if (!path.length) return object;
        if (isObject(object)) {
            if (hasEval) return compiledGetValueAtPath(object, path);
            var newValue;
            return path.walkPropertiesFrom(object, function(prop, value, i) {
                i === path.length && (newValue = value);
            }), newValue;
        }
    }
    function setPathValue(obj, path, value) {
        if (!path.length || !isObject(obj)) return !1;
        var changed = !1;
        return path.walkPropertiesFrom(obj, function(prop, m, i) {
            isObject(m) && i == path.length - 1 && (changed = !0, m[prop] = value);
        }), changed;
    }
    function newCompiledGetValueAtPath(path) {
        var str = "", partStr = "obj", length = path.length;
        str += "if (obj";
        for (var i = 0; length - 1 > i; i++) {
            var part = '["' + path[i] + '"]';
            partStr += part, str += " && " + partStr;
        }
        return str += ") ", partStr += '["' + path[length - 1] + '"]', str += "return " + partStr + "; else return undefined;", 
        new Function("obj", str);
    }
    function compiledGetValueAtPath(object, path) {
        var pathString = path.toString();
        return compiledGettersCache[pathString] || (compiledGettersCache[pathString] = newCompiledGetValueAtPath(path)), 
        compiledGettersCache[pathString](object);
    }
    function getPathValueObserved(object, path, currentlyObserved, observedMap, callback) {
        var newValue = void 0;
        return path.walkPropertiesFrom(object, function(prop, value, i) {
            if (i === path.length) return newValue = value, void 0;
            var observed = currentlyObserved[i];
            if (!observed || value !== observed[0]) {
                if (observed) for (var j = 0; j < observed.length; j++) {
                    var obj = observed[j], count = observedMap.get(obj);
                    1 == count ? (observedMap.delete(obj), global.unobserveCount++, Object.unobserve(obj, callback)) : observedMap.set(obj, count - 1);
                }
                if (observed = value, isObject(observed)) {
                    for (var observed = []; isObject(value); ) {
                        observed.push(value);
                        var count = observedMap.get(value);
                        count ? observedMap.set(value, count + 1) : (observedMap.set(value, 1), global.observeCount++, 
                        Object.observe(value, callback)), value = Object.getPrototypeOf(value);
                    }
                    currentlyObserved[i] = observed;
                }
            }
        }, this), newValue;
    }
    function PathObserver(object, pathString, callback) {
        if (this.value = void 0, isPathValid(pathString)) {
            var path = new Path(pathString);
            return path.length ? (isObject(object) && (this.object = object, this.path = path, 
            hasObserve ? (this.observed = new Array(path.length), this.observedMap = new Map(), 
            this.getPathValue = getPathValueObserved) : this.getPathValue = getPathValue, Observer.call(this, callback)), 
            void 0) : (this.value = object, void 0);
        }
    }
    function notifyFunction(object, name) {
        if ("function" == typeof Object.observe) {
            var notifier = Object.getNotifier(object);
            return function(type, oldValue) {
                var changeRecord = {
                    object: object,
                    type: type,
                    name: name
                };
                2 === arguments.length && (changeRecord.oldValue = oldValue), notifier.notify(changeRecord);
            };
        }
    }
    function diffObjectFromChangeRecords(object, changeRecords, oldValues) {
        for (var added = {}, removed = {}, i = 0; i < changeRecords.length; i++) {
            var record = changeRecords[i];
            knownRecordTypes[record.type] ? (record.name in oldValues || (oldValues[record.name] = record.oldValue), 
            "updated" != record.type && ("new" != record.type ? record.name in added ? (delete added[record.name], 
            delete oldValues[record.name]) : removed[record.name] = !0 : record.name in removed ? delete removed[record.name] : added[record.name] = !0)) : (console.error("Unknown changeRecord type: " + record.type), 
            console.error(record));
        }
        for (var prop in added) added[prop] = object[prop];
        for (var prop in removed) removed[prop] = void 0;
        var changed = {};
        for (var prop in oldValues) if (!(prop in added || prop in removed)) {
            var newValue = object[prop];
            oldValues[prop] !== newValue && (changed[prop] = newValue);
        }
        return {
            added: added,
            removed: removed,
            changed: changed
        };
    }
    function calcEditDistances(current, currentStart, currentEnd, old, oldStart, oldEnd) {
        for (var rowCount = oldEnd - oldStart + 1, columnCount = currentEnd - currentStart + 1, distances = new Array(rowCount), i = 0; rowCount > i; i++) distances[i] = new Array(columnCount), 
        distances[i][0] = i;
        for (var j = 0; columnCount > j; j++) distances[0][j] = j;
        for (var i = 1; rowCount > i; i++) for (var j = 1; columnCount > j; j++) if (old[oldStart + i - 1] === current[currentStart + j - 1]) distances[i][j] = distances[i - 1][j - 1]; else {
            var north = distances[i - 1][j] + 1, west = distances[i][j - 1] + 1;
            distances[i][j] = west > north ? north : west;
        }
        return distances;
    }
    function spliceOperationsFromEditDistances(distances) {
        for (var i = distances.length - 1, j = distances[0].length - 1, current = distances[i][j], edits = []; i > 0 || j > 0; ) if (0 != i) if (0 != j) {
            var min, northWest = distances[i - 1][j - 1], west = distances[i - 1][j], north = distances[i][j - 1];
            min = north > west ? northWest > west ? west : northWest : northWest > north ? north : northWest, 
            min == northWest ? (northWest == current ? edits.push(EDIT_LEAVE) : (edits.push(EDIT_UPDATE), 
            current = northWest), i--, j--) : min == west ? (edits.push(EDIT_DELETE), i--, current = west) : (edits.push(EDIT_ADD), 
            j--, current = north);
        } else edits.push(EDIT_DELETE), i--; else edits.push(EDIT_ADD), j--;
        return edits.reverse(), edits;
    }
    function sharedPrefix(arr1, arr2, searchLength) {
        for (var i = 0; searchLength > i; i++) if (arr1[i] !== arr2[i]) return i;
        return searchLength;
    }
    function sharedSuffix(arr1, arr2, searchLength) {
        for (var index1 = arr1.length, index2 = arr2.length, count = 0; searchLength > count && arr1[--index1] === arr2[--index2]; ) count++;
        return count;
    }
    function newSplice(index, removed, addedCount) {
        return {
            index: index,
            removed: removed,
            addedCount: addedCount
        };
    }
    function calcSplices(current, currentStart, currentEnd, old, oldStart, oldEnd) {
        var prefixCount = 0, suffixCount = 0, minLength = Math.min(currentEnd - currentStart, oldEnd - oldStart);
        if (0 == currentStart && 0 == oldStart && (prefixCount = sharedPrefix(current, old, minLength)), 
        currentEnd == current.length && oldEnd == old.length && (suffixCount = sharedSuffix(current, old, minLength - prefixCount)), 
        currentStart += prefixCount, oldStart += prefixCount, currentEnd -= suffixCount, 
        oldEnd -= suffixCount, 0 == currentEnd - currentStart && 0 == oldEnd - oldStart) return [];
        if (currentStart == currentEnd) {
            for (var splice = newSplice(currentStart, [], 0); oldEnd > oldStart; ) splice.removed.push(old[oldStart++]);
            return [ splice ];
        }
        if (oldStart == oldEnd) return [ newSplice(currentStart, [], currentEnd - currentStart) ];
        for (var ops = spliceOperationsFromEditDistances(calcEditDistances(current, currentStart, currentEnd, old, oldStart, oldEnd)), splice = void 0, splices = [], index = currentStart, oldIndex = oldStart, i = 0; i < ops.length; i++) switch (ops[i]) {
          case EDIT_LEAVE:
            splice && (splices.push(splice), splice = void 0), index++, oldIndex++;
            break;

          case EDIT_UPDATE:
            splice || (splice = newSplice(index, [], 0)), splice.addedCount++, index++, splice.removed.push(old[oldIndex]), 
            oldIndex++;
            break;

          case EDIT_ADD:
            splice || (splice = newSplice(index, [], 0)), splice.addedCount++, index++;
            break;

          case EDIT_DELETE:
            splice || (splice = newSplice(index, [], 0)), splice.removed.push(old[oldIndex]), 
            oldIndex++;
        }
        return splice && splices.push(splice), splices;
    }
    function intersect(start1, end1, start2, end2) {
        return start2 > end1 || start1 > end2 ? -1 : end1 == start2 || end2 == start1 ? 0 : start2 > start1 ? end2 > end1 ? end1 - start2 : end2 - start2 : end1 > end2 ? end2 - start1 : end1 - start1;
    }
    function mergeSplice(splices, index, removed, addedCount) {
        for (var splice = newSplice(index, removed, addedCount), inserted = !1, insertionOffset = 0, i = 0; i < splices.length; i++) {
            var current = splices[i];
            if (current.index += insertionOffset, !inserted) {
                var intersectCount = intersect(splice.index, splice.index + splice.removed.length, current.index, current.index + current.addedCount);
                if (intersectCount >= 0) {
                    splices.splice(i, 1), i--, insertionOffset -= current.addedCount - current.removed.length, 
                    splice.addedCount += current.addedCount - intersectCount;
                    var deleteCount = splice.removed.length + current.removed.length - intersectCount;
                    if (splice.addedCount || deleteCount) {
                        var removed = current.removed;
                        if (splice.index < current.index) {
                            var prepend = splice.removed.slice(0, current.index - splice.index);
                            Array.prototype.push.apply(prepend, removed), removed = prepend;
                        }
                        if (splice.index + splice.removed.length > current.index + current.addedCount) {
                            var append = splice.removed.slice(current.index + current.addedCount - splice.index);
                            Array.prototype.push.apply(removed, append);
                        }
                        splice.removed = removed, current.index < splice.index && (splice.index = current.index);
                    } else inserted = !0;
                } else if (splice.index < current.index) {
                    inserted = !0, splices.splice(i, 0, splice), i++;
                    var offset = splice.addedCount - splice.removed.length;
                    current.index += offset, insertionOffset += offset;
                }
            }
        }
        inserted || splices.push(splice);
    }
    function createInitialSplices(array, changeRecords) {
        for (var splices = [], i = 0; i < changeRecords.length; i++) {
            var record = changeRecords[i];
            switch (record.type) {
              case "splice":
                mergeSplice(splices, record.index, record.removed.slice(), record.addedCount);
                break;

              case "new":
              case "updated":
              case "deleted":
                if (!isIndex(record.name)) continue;
                var index = toNumber(record.name);
                if (0 > index) continue;
                mergeSplice(splices, index, [ record.oldValue ], 1);
                break;

              default:
                console.error("Unexpected record type: " + JSON.stringify(record));
            }
        }
        return splices;
    }
    function projectArraySplices(array, changeRecords) {
        var splices = [];
        return createInitialSplices(array, changeRecords).forEach(function(splice) {
            return 1 == splice.addedCount && 1 == splice.removed.length ? (splice.removed[0] !== array[splice.index] && splices.push(splice), 
            void 0) : (splices = splices.concat(calcSplices(array, splice.index, splice.index + splice.addedCount, splice.removed, 0, splice.removed.length)), 
            void 0);
        }), splices;
    }
    var hasObserve = detectObjectObserve(), hasEval = !1;
    try {
        var f = new Function("", "return true;");
        hasEval = f();
    } catch (ex) {}
    var numberIsNaN = global.Number.isNaN || function(value) {
        return "number" == typeof value && global.isNaN(value);
    }, createObject = "__proto__" in {} ? function(obj) {
        return obj;
    } : function(obj) {
        var proto = obj.__proto__;
        if (!proto) return obj;
        var newObject = Object.create(proto);
        return Object.getOwnPropertyNames(obj).forEach(function(name) {
            Object.defineProperty(newObject, name, Object.getOwnPropertyDescriptor(obj, name));
        }), newObject;
    }, identStart = "[$_a-zA-Z]", identPart = "[$_a-zA-Z0-9]", ident = identStart + "+" + identPart + "*", elementIndex = "(?:[0-9]|[1-9]+[0-9]+)", identOrElementIndex = "(?:" + ident + "|" + elementIndex + ")", path = "(?:" + identOrElementIndex + ")(?:\\." + identOrElementIndex + ")*", pathRegExp = new RegExp("^" + path + "$");
    Path.prototype = createObject({
        __proto__: [],
        toString: function() {
            return this.join(".");
        },
        walkPropertiesFrom: function(val, f, that) {
            for (var prop, i = 0; i < this.length + 1; i++) prop = this[i], f.call(that, prop, val, i), 
            val = i == this.length || null === val || void 0 === val ? void 0 : val[prop];
        }
    });
    var MAX_DIRTY_CHECK_CYCLES = 1e3;
    Observer.prototype = {
        valid: !1,
        internalCallback: function(records) {
            this.valid && this.reporting && this.check(records) && (this.report(), this.testingResults && (this.testingResults.anyChanged = !0));
        },
        close: function() {
            this.valid && (this.disconnect(), this.valid = !1, removeFromAll(this));
        },
        deliver: function(testingResults) {
            this.valid && (hasObserve ? (this.testingResults = testingResults, Object.deliverChangeRecords(this.boundInternalCallback), 
            this.testingResults = void 0) : dirtyCheck(this));
        },
        report: function() {
            if (this.reporting) {
                this.sync(!1);
                try {
                    this.callback.apply(void 0, this.reportArgs);
                } catch (ex) {
                    Observer._errorThrownDuringCallback = !0, console.error("Exception caught during observer callback: " + ex);
                }
                this.reportArgs = void 0;
            }
        },
        reset: function() {
            this.valid && (hasObserve && (this.reporting = !1, Object.deliverChangeRecords(this.boundInternalCallback), 
            this.reporting = !0), this.sync(!0));
        }
    };
    var allObservers, collectObservers = !hasObserve || global.forceCollectObservers;
    collectObservers && (allObservers = [], Observer._allObserversCount = 0);
    var runningMicrotaskCheckpoint = !1;
    global.Platform = global.Platform || {}, global.Platform.performMicrotaskCheckpoint = function() {
        if (collectObservers && !runningMicrotaskCheckpoint) {
            runningMicrotaskCheckpoint = !0;
            var cycles = 0, results = {};
            do {
                cycles++;
                var toCheck = allObservers;
                allObservers = [], results.anyChanged = !1;
                for (var i = 0; i < toCheck.length; i++) {
                    var observer = toCheck[i];
                    observer && observer.valid && (hasObserve ? observer.deliver(results) : observer.check() && (results.anyChanged = !0, 
                    observer.report()), allObservers.push(observer));
                }
            } while (MAX_DIRTY_CHECK_CYCLES > cycles && results.anyChanged);
            Observer._allObserversCount = allObservers.length, runningMicrotaskCheckpoint = !1;
        }
    }, collectObservers && (global.Platform.clearObservers = function() {
        allObservers = [];
    }), ObjectObserver.prototype = createObject({
        __proto__: Observer.prototype,
        connect: function() {
            hasObserve && Object.observe(this.object, this.boundInternalCallback);
        },
        sync: function() {
            hasObserve || (this.oldObject = copyObject(this.object));
        },
        check: function(changeRecords) {
            var diff, oldValues;
            if (hasObserve) {
                if (!changeRecords) return !1;
                oldValues = {}, diff = diffObjectFromChangeRecords(this.object, changeRecords, oldValues);
            } else oldValues = this.oldObject, diff = diffObjectFromOldObject(this.object, this.oldObject);
            return diffIsEmpty(diff) ? !1 : (this.reportArgs = [ diff.added || {}, diff.removed || {}, diff.changed || {} ], 
            this.reportArgs.push(function(property) {
                return oldValues[property];
            }), !0);
        },
        disconnect: function() {
            hasObserve ? this.object && Object.unobserve(this.object, this.boundInternalCallback) : this.oldObject = void 0, 
            this.object = void 0;
        }
    }), ArrayObserver.prototype = createObject({
        __proto__: ObjectObserver.prototype,
        connect: function() {
            hasObserve && Array.observe(this.object, this.boundInternalCallback);
        },
        sync: function() {
            hasObserve || (this.oldObject = this.object.slice());
        },
        check: function(changeRecords) {
            var splices;
            if (hasObserve) {
                if (!changeRecords) return !1;
                splices = projectArraySplices(this.object, changeRecords);
            } else splices = calcSplices(this.object, 0, this.object.length, this.oldObject, 0, this.oldObject.length);
            return splices && splices.length ? (this.reportArgs = [ splices ], !0) : !1;
        }
    }), ArrayObserver.applySplices = function(previous, current, splices) {
        splices.forEach(function(splice) {
            for (var spliceArgs = [ splice.index, splice.removed.length ], addIndex = splice.index; addIndex < splice.index + splice.addedCount; ) spliceArgs.push(current[addIndex]), 
            addIndex++;
            Array.prototype.splice.apply(previous, spliceArgs);
        });
    };
    var compiledGettersCache = {};
    PathObserver.prototype = createObject({
        __proto__: Observer.prototype,
        connect: function() {},
        disconnect: function() {
            this.object = void 0, this.value = void 0, this.sync(!0);
        },
        check: function() {
            return this.value = this.getPathValue(this.object, this.path, this.observed, this.observedMap, this.boundInternalCallback), 
            areSameValue(this.value, this.oldValue) ? !1 : (this.reportArgs = [ this.value, this.oldValue ], 
            !0);
        },
        sync: function(hard) {
            hard && (this.value = this.getPathValue(this.object, this.path, this.observed, this.observedMap, this.boundInternalCallback)), 
            this.oldValue = this.value;
        }
    }), PathObserver.getValueAtPath = function(obj, pathString) {
        if (!isPathValid(pathString)) return void 0;
        var path = new Path(pathString);
        return getPathValue(obj, path);
    }, PathObserver.setValueAtPath = function(obj, pathString, value) {
        if (isPathValid(pathString)) {
            var path = new Path(pathString);
            setPathValue(obj, path, value);
        }
    };
    var knownRecordTypes = {
        "new": !0,
        updated: !0,
        deleted: !0
    };
    PathObserver.defineProperty = function(object, name, descriptor) {
        var obj = descriptor.object, path = new Path(descriptor.path), notify = notifyFunction(object, name), observer = new PathObserver(obj, descriptor.path, function(newValue, oldValue) {
            notify && notify("updated", oldValue);
        });
        return Object.defineProperty(object, name, {
            get: function() {
                return getPathValue(obj, path);
            },
            set: function(newValue) {
                setPathValue(obj, path, newValue);
            },
            configurable: !0
        }), {
            close: function() {
                notify && observer.deliver(), observer.close(), delete object[name];
            }
        };
    };
    var EDIT_LEAVE = 0, EDIT_UPDATE = 1, EDIT_ADD = 2, EDIT_DELETE = 3;
    global.Observer = Observer, global.Observer.hasObjectObserve = hasObserve, global.ArrayObserver = ArrayObserver, 
    global.ArrayObserver.calculateSplices = function(current, previous) {
        return calcSplices(current, 0, current.length, previous, 0, previous.length);
    }, global.ObjectObserver = ObjectObserver, global.PathObserver = PathObserver;
}(this), function(global) {
    
    function assert(v) {
        if (!v) throw new Error("Assertion failed");
    }
    function getTreeScope(node) {
        for (;node.parentNode; ) node = node.parentNode;
        return "function" == typeof node.getElementById ? node : null;
    }
    function isNodeInDocument(node) {
        return node.ownerDocument.contains(node);
    }
    function bindNode(name, model, path) {
        console.error("Unhandled binding to Node: ", this, name, model, path);
    }
    function unbindNode() {}
    function unbindAllNode() {}
    function Binding(model, path, changed) {
        this.model = model, this.path = path, this.changed = changed, this.observer = new PathObserver(this.model, this.path, this.changed), 
        this.changed(this.observer.value);
    }
    function boundSetTextContent(textNode) {
        return function(value) {
            textNode.data = void 0 == value ? "" : String(value);
        };
    }
    function bindText(name, model, path) {
        if ("textContent" !== name) return Node.prototype.bind.call(this, name, model, path);
        this.unbind("textContent");
        var binding = new Binding(model, path, boundSetTextContent(this));
        textContentBindingTable.set(this, binding);
    }
    function unbindText(name) {
        if ("textContent" != name) return Node.prototype.unbind.call(this, name);
        var binding = textContentBindingTable.get(this);
        binding && (binding.dispose(), textContentBindingTable.delete(this));
    }
    function unbindAllText() {
        this.unbind("textContent"), Node.prototype.unbindAll.call(this);
    }
    function boundSetAttribute(element, attributeName, conditional) {
        return conditional ? function(value) {
            value ? element.setAttribute(attributeName, "") : element.removeAttribute(attributeName);
        } : function(value) {
            element.setAttribute(attributeName, String(void 0 === value ? "" : value));
        };
    }
    function ElementAttributeBindings() {
        this.bindingMap = Object.create(null);
    }
    function bindElement(name, model, path) {
        var bindings = attributeBindingsTable.get(this);
        bindings || (bindings = new ElementAttributeBindings(), attributeBindingsTable.set(this, bindings)), 
        bindings.add(this, name, model, path);
    }
    function unbindElement(name) {
        var bindings = attributeBindingsTable.get(this);
        bindings && bindings.remove(name);
    }
    function unbindAllElement() {
        var bindings = attributeBindingsTable.get(this);
        bindings && (attributeBindingsTable.delete(this), bindings.removeAll(), Node.prototype.unbindAll.call(this));
    }
    function getEventForInputType(element) {
        switch (element.type) {
          case "checkbox":
            return checkboxEventType;

          case "radio":
          case "select-multiple":
          case "select-one":
            return "change";

          default:
            return "input";
        }
    }
    function InputBinding(element, valueProperty, model, path) {
        this.element = element, this.valueProperty = valueProperty, this.boundValueChanged = this.valueChanged.bind(this), 
        this.boundUpdateBinding = this.updateBinding.bind(this), this.binding = new Binding(model, path, this.boundValueChanged), 
        this.element.addEventListener(getEventForInputType(this.element), this.boundUpdateBinding, !0);
    }
    function ValueBinding(element, model, path) {
        InputBinding.call(this, element, "value", model, path);
    }
    function getAssociatedRadioButtons(element) {
        if (!isNodeInDocument(element)) return [];
        if (element.form) return filter(element.form.elements, function(el) {
            return el != element && "INPUT" == el.tagName && "radio" == el.type && el.name == element.name;
        });
        var radios = element.ownerDocument.querySelectorAll('input[type="radio"][name="' + element.name + '"]');
        return filter(radios, function(el) {
            return el != element && !el.form;
        });
    }
    function CheckedBinding(element, model, path) {
        InputBinding.call(this, element, "checked", model, path);
    }
    function bindInput(name, model, path) {
        switch (this.tagName + "." + name.toLowerCase()) {
          case "INPUT.value":
          case "TEXTAREA.value":
            this.unbind("value"), this.removeAttribute("value"), valueBindingTable.set(this, new ValueBinding(this, model, path));
            break;

          case "INPUT.checked":
            this.unbind("checked"), this.removeAttribute("checked"), checkedBindingTable.set(this, new CheckedBinding(this, model, path));
            break;

          case "SELECT.selectedindex":
            this.unbind("selectedindex"), this.removeAttribute("selectedindex"), valueBindingTable.set(this, new SelectedIndexBinding(this, model, path));
            break;

          default:
            return Element.prototype.bind.call(this, name, model, path);
        }
    }
    function unbindInput(name) {
        switch (this.tagName + "." + name.toLowerCase()) {
          case "INPUT.value":
          case "TEXTAREA.value":
            var valueBinding = valueBindingTable.get(this);
            valueBinding && (valueBinding.unbind(), valueBindingTable.delete(this));
            break;

          case "INPUT.checked":
            var checkedBinding = checkedBindingTable.get(this);
            checkedBinding && (checkedBinding.unbind(), checkedBindingTable.delete(this));
            break;

          case "SELECT.selectedindex":
            var valueBinding = valueBindingTable.get(this);
            valueBinding && (valueBinding.unbind(), valueBindingTable.delete(this));
            break;

          default:
            return Element.prototype.unbind.call(this, name);
        }
    }
    function unbindAllInput() {
        switch (this.tagName) {
          case "INPUT":
            this.unbind("checked");

          case "TEXTAREA":
            this.unbind("value");
            break;

          case "SELECT":
            this.unbind("selectedindex");
        }
        Element.prototype.unbindAll.call(this);
    }
    function SelectedIndexBinding(element, model, path) {
        InputBinding.call(this, element, "selectedIndex", model, path);
    }
    function isAttributeTemplate(el) {
        return semanticTemplateElements[el.tagName] && el.hasAttribute("template");
    }
    function isTemplate(el) {
        return "TEMPLATE" == el.tagName || isAttributeTemplate(el);
    }
    function isNativeTemplate(el) {
        return hasTemplateElement && "TEMPLATE" == el.tagName;
    }
    function forAllTemplatesFrom(node, fn) {
        var subTemplates = node.querySelectorAll(allTemplatesSelectors);
        isTemplate(node) && fn(node), forEach(subTemplates, fn);
    }
    function bootstrapTemplatesRecursivelyFrom(node) {
        function bootstrap(template) {
            HTMLTemplateElement.decorate(template) || bootstrapTemplatesRecursivelyFrom(template.content);
        }
        forAllTemplatesFrom(node, bootstrap);
    }
    function mixin(to, from) {
        Object.getOwnPropertyNames(from).forEach(function(name) {
            Object.defineProperty(to, name, Object.getOwnPropertyDescriptor(from, name));
        });
    }
    function getTemplateContentsOwner(doc) {
        if (!doc.defaultView) return doc;
        var d = templateContentsOwnerTable.get(doc);
        if (!d) {
            for (d = doc.implementation.createHTMLDocument(""); d.lastChild; ) d.removeChild(d.lastChild);
            templateContentsOwnerTable.set(doc, d);
        }
        return d;
    }
    function extractTemplateFromAttributeTemplate(el) {
        var template = el.ownerDocument.createElement("template");
        el.parentNode.insertBefore(template, el);
        for (var attribs = el.attributes, count = attribs.length; count-- > 0; ) {
            var attrib = attribs[count];
            templateAttributeDirectives[attrib.name] && ("template" !== attrib.name && template.setAttribute(attrib.name, attrib.value), 
            el.removeAttribute(attrib.name));
        }
        return template;
    }
    function liftNonNativeTemplateChildrenIntoContent(template, el, useRoot) {
        var content = template.content;
        if (useRoot) return content.appendChild(el), void 0;
        for (var child; child = el.firstChild; ) content.appendChild(child);
    }
    function fixTemplateElementPrototype(el) {
        "TEMPLATE" === el.tagName ? hasTemplateElement || (hasProto ? el.__proto__ = HTMLTemplateElement.prototype : mixin(el, HTMLTemplateElement.prototype)) : (mixin(el, HTMLTemplateElement.prototype), 
        Object.defineProperty(el, "content", contentDescriptor));
    }
    function ensureSetModelScheduled(template) {
        var setModelFn = templateSetModelFnTable.get(template);
        setModelFn || (setModelFn = function() {
            addBindings(template, template.model, template.bindingDelegate);
        }, templateSetModelFnTable.set(template, setModelFn)), ensureScheduled(setModelFn);
    }
    function Token(type, value) {
        this.type = type, this.value = value;
    }
    function parseMustacheTokens(s) {
        for (var result = [], length = s.length, index = 0, lastIndex = 0; length > lastIndex; ) {
            if (index = s.indexOf("{{", lastIndex), 0 > index) {
                result.push(new Token(TEXT, s.slice(lastIndex)));
                break;
            }
            if (index > 0 && index > lastIndex && result.push(new Token(TEXT, s.slice(lastIndex, index))), 
            lastIndex = index + 2, index = s.indexOf("}}", lastIndex), 0 > index) {
                var text = s.slice(lastIndex - 2), lastToken = result[result.length - 1];
                lastToken && lastToken.type == TEXT ? lastToken.value += text : result.push(new Token(TEXT, text));
                break;
            }
            var value = s.slice(lastIndex, index).trim();
            result.push(new Token(BINDING, value)), lastIndex = index + 2;
        }
        return result;
    }
    function bindOrDelegate(node, name, model, path, delegate) {
        var delegateBinding, delegateFunction = delegate && delegate[GET_BINDING];
        delegateFunction && "function" == typeof delegateFunction && (delegateBinding = delegateFunction(model, path, name, node), 
        delegateBinding && (model = delegateBinding, path = "value")), node.bind(name, model, path);
    }
    function parseAndBind(node, name, text, model, delegate) {
        var tokens = parseMustacheTokens(text);
        if (tokens.length && (1 != tokens.length || tokens[0].type != TEXT)) {
            if (1 == tokens.length && tokens[0].type == BINDING) return bindOrDelegate(node, name, model, tokens[0].value, delegate), 
            void 0;
            for (var replacementBinding = new CompoundBinding(), i = 0; i < tokens.length; i++) {
                var token = tokens[i];
                token.type == BINDING && bindOrDelegate(replacementBinding, i, model, token.value, delegate);
            }
            replacementBinding.combinator = function(values) {
                for (var newValue = "", i = 0; i < tokens.length; i++) {
                    var token = tokens[i];
                    if (token.type === TEXT) newValue += token.value; else {
                        var value = values[i];
                        void 0 !== value && (newValue += value);
                    }
                }
                return newValue;
            }, node.bind(name, replacementBinding, "value");
        }
    }
    function addAttributeBindings(element, model, delegate) {
        assert(element);
        for (var attrs = {}, i = 0; i < element.attributes.length; i++) {
            var attr = element.attributes[i];
            attrs[attr.name] = attr.value;
        }
        isTemplate(element) && ("" === attrs[BIND] && (attrs[BIND] = "{{}}"), "" === attrs[REPEAT] && (attrs[REPEAT] = "{{}}"), 
        void 0 !== attrs[IF] && void 0 === attrs[BIND] && void 0 === attrs[REPEAT] && (attrs[BIND] = "{{}}")), 
        Object.keys(attrs).forEach(function(attrName) {
            parseAndBind(element, attrName, attrs[attrName], model, delegate);
        });
    }
    function addBindings(node, model, delegate) {
        assert(node), node.nodeType === Node.ELEMENT_NODE ? addAttributeBindings(node, model, delegate) : node.nodeType === Node.TEXT_NODE && parseAndBind(node, "textContent", node.data, model, delegate);
        for (var child = node.firstChild; child; child = child.nextSibling) addBindings(child, model, delegate);
    }
    function unbindAllRecursively(node) {
        if (templateInstanceTable.delete(node), isTemplate(node)) {
            var templateIterator = templateIteratorTable.get(node);
            templateIterator && (templateIterator.abandon(), templateIteratorTable.delete(node));
        }
        node.unbindAll();
        for (var child = node.firstChild; child; child = child.nextSibling) unbindAllRecursively(child);
    }
    function createDeepCloneAndDecorateTemplates(node, delegate) {
        var clone = node.cloneNode(!1);
        isTemplate(clone) && (HTMLTemplateElement.decorate(clone, node), delegate && templateBindingDelegateTable.set(clone, delegate));
        for (var child = node.firstChild; child; child = child.nextSibling) clone.appendChild(createDeepCloneAndDecorateTemplates(child, delegate));
        return clone;
    }
    function TemplateInstance(firstNode, lastNode, model) {
        this.firstNode = firstNode, this.lastNode = lastNode, this.model = model;
    }
    function addTemplateInstanceRecord(fragment, model) {
        if (fragment.firstChild) for (var instanceRecord = new TemplateInstance(fragment.firstChild, fragment.lastChild, model), node = instanceRecord.firstNode; node; ) templateInstanceTable.set(node, instanceRecord), 
        node = node.nextSibling;
    }
    function CompoundBinding(combinator) {
        this.bindings = {}, this.values = {}, this.value = void 0, this.size = 0, this.combinator_ = combinator, 
        this.boundResolve = this.resolve.bind(this), this.disposed = !1;
    }
    function TemplateIterator(templateElement) {
        this.templateElement_ = templateElement, this.terminators = [], this.iteratedValue = void 0, 
        this.arrayObserver = void 0, this.boundHandleSplices = this.handleSplices.bind(this), 
        this.inputs = new CompoundBinding(this.resolveInputs.bind(this));
    }
    var Map, forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach), filter = Array.prototype.filter.call.bind(Array.prototype.filter);
    global.Map && "function" == typeof global.Map.prototype.forEach ? Map = global.Map : (Map = function() {
        this.keys = [], this.values = [];
    }, Map.prototype = {
        set: function(key, value) {
            var index = this.keys.indexOf(key);
            0 > index ? (this.keys.push(key), this.values.push(value)) : this.values[index] = value;
        },
        get: function(key) {
            var index = this.keys.indexOf(key);
            if (!(0 > index)) return this.values[index];
        },
        "delete": function(key) {
            var index = this.keys.indexOf(key);
            return 0 > index ? !1 : (this.keys.splice(index, 1), this.values.splice(index, 1), 
            !0);
        },
        forEach: function(f, opt_this) {
            for (var i = 0; i < this.keys.length; i++) f.call(opt_this || this, this.values[i], this.keys[i], this);
        }
    });
    var createObject = "__proto__" in {} ? function(obj) {
        return obj;
    } : function(obj) {
        var proto = obj.__proto__;
        if (!proto) return obj;
        var newObject = Object.create(proto);
        return Object.getOwnPropertyNames(obj).forEach(function(name) {
            Object.defineProperty(newObject, name, Object.getOwnPropertyDescriptor(obj, name));
        }), newObject;
    };
    "function" != typeof document.contains && (Document.prototype.contains = function(node) {
        return node === this || node.parentNode === this ? !0 : this.documentElement.contains(node);
    });
    var SideTable;
    "undefined" != typeof WeakMap && navigator.userAgent.indexOf("Firefox/") < 0 ? SideTable = WeakMap : function() {
        var a = Object.defineProperty, b = Object.hasOwnProperty, c = new Date().getTime() % 1e9;
        SideTable = function() {
            this.name = "__st" + (1e9 * Math.random() >>> 0) + (c++ + "__");
        }, SideTable.prototype = {
            set: function(b, c) {
                a(b, this.name, {
                    value: c,
                    writable: !0
                });
            },
            get: function(a) {
                return b.call(a, this.name) ? a[this.name] : void 0;
            },
            "delete": function(a) {
                this.set(a, void 0);
            }
        };
    }(), Node.prototype.bind = bindNode, Node.prototype.unbind = unbindNode, Node.prototype.unbindAll = unbindAllNode;
    var textContentBindingTable = new SideTable();
    Binding.prototype = {
        dispose: function() {
            this.model && "function" == typeof this.model.dispose && this.model.dispose(), this.observer.close();
        },
        set value(newValue) {
            PathObserver.setValueAtPath(this.model, this.path, newValue);
        },
        reset: function() {
            this.observer.reset();
        }
    }, Text.prototype.bind = bindText, Text.prototype.unbind = unbindText, Text.prototype.unbindAll = unbindAllText;
    var attributeBindingsTable = new SideTable();
    ElementAttributeBindings.prototype = {
        add: function(element, attributeName, model, path) {
            element.removeAttribute(attributeName);
            var conditional = "?" == attributeName[attributeName.length - 1];
            conditional && (attributeName = attributeName.slice(0, -1)), this.remove(attributeName);
            var binding = new Binding(model, path, boundSetAttribute(element, attributeName, conditional));
            this.bindingMap[attributeName] = binding;
        },
        remove: function(attributeName) {
            var binding = this.bindingMap[attributeName];
            binding && (binding.dispose(), delete this.bindingMap[attributeName]);
        },
        removeAll: function() {
            Object.keys(this.bindingMap).forEach(function(attributeName) {
                this.remove(attributeName);
            }, this);
        }
    }, Element.prototype.bind = bindElement, Element.prototype.unbind = unbindElement, 
    Element.prototype.unbindAll = unbindAllElement;
    var checkboxEventType, valueBindingTable = new SideTable(), checkedBindingTable = new SideTable();
    (function() {
        var div = document.createElement("div"), checkbox = div.appendChild(document.createElement("input"));
        checkbox.setAttribute("type", "checkbox");
        var first, count = 0;
        checkbox.addEventListener("click", function() {
            count++, first = first || "click";
        }), checkbox.addEventListener("change", function() {
            count++, first = first || "change";
        });
        var event = document.createEvent("MouseEvent");
        event.initMouseEvent("click", !0, !0, window, 0, 0, 0, 0, 0, !1, !1, !1, !1, 0, null), 
        checkbox.dispatchEvent(event), checkboxEventType = 1 == count ? "change" : first;
    })(), InputBinding.prototype = {
        valueChanged: function(newValue) {
            this.element[this.valueProperty] = this.produceElementValue(newValue);
        },
        updateBinding: function() {
            this.binding.value = this.element[this.valueProperty], this.binding.reset(), this.postUpdateBinding && this.postUpdateBinding(), 
            Platform.performMicrotaskCheckpoint();
        },
        unbind: function() {
            this.binding.dispose(), this.element.removeEventListener(getEventForInputType(this.element), this.boundUpdateBinding, !0);
        }
    }, ValueBinding.prototype = createObject({
        __proto__: InputBinding.prototype,
        produceElementValue: function(value) {
            return String(null == value ? "" : value);
        }
    }), CheckedBinding.prototype = createObject({
        __proto__: InputBinding.prototype,
        produceElementValue: function(value) {
            return Boolean(value);
        },
        postUpdateBinding: function() {
            "INPUT" === this.element.tagName && "radio" === this.element.type && getAssociatedRadioButtons(this.element).forEach(function(r) {
                var checkedBinding = checkedBindingTable.get(r);
                checkedBinding && (checkedBinding.binding.value = !1);
            });
        }
    }), HTMLInputElement.prototype.bind = bindInput, HTMLInputElement.prototype.unbind = unbindInput, 
    HTMLInputElement.prototype.unbindAll = unbindAllInput, SelectedIndexBinding.prototype = createObject({
        __proto__: InputBinding.prototype,
        valueChanged: function(newValue) {
            function delaySetSelectedIndex() {
                newValue > self.element.length && maxRetries-- ? ensureScheduled(delaySetSelectedIndex) : self.element[self.valueProperty] = newValue;
            }
            var newValue = this.produceElementValue(newValue);
            if (newValue <= this.element.length) return this.element[this.valueProperty] = newValue, 
            void 0;
            var maxRetries = 2, self = this;
            ensureScheduled(delaySetSelectedIndex);
        },
        produceElementValue: function(value) {
            return Number(value);
        }
    }), HTMLSelectElement.prototype.bind = bindInput, HTMLSelectElement.prototype.unbind = unbindInput, 
    HTMLSelectElement.prototype.unbindAll = unbindAllInput, HTMLTextAreaElement.prototype.bind = bindInput, 
    HTMLTextAreaElement.prototype.unbind = unbindInput, HTMLTextAreaElement.prototype.unbindAll = unbindAllInput;
    var BIND = "bind", REPEAT = "repeat", IF = "if", GET_BINDING = "getBinding", GET_INSTANCE_MODEL = "getInstanceModel", templateAttributeDirectives = {
        template: !0,
        repeat: !0,
        bind: !0,
        ref: !0
    }, semanticTemplateElements = {
        THEAD: !0,
        TBODY: !0,
        TFOOT: !0,
        TH: !0,
        TR: !0,
        TD: !0,
        COLGROUP: !0,
        COL: !0,
        CAPTION: !0,
        OPTION: !0,
        OPTGROUP: !0
    }, hasTemplateElement = "undefined" != typeof HTMLTemplateElement, allTemplatesSelectors = "template, " + Object.keys(semanticTemplateElements).map(function(tagName) {
        return tagName.toLowerCase() + "[template]";
    }).join(", "), ensureScheduled = function() {
        function Runner() {
            var self = this;
            this.value = !1;
            var lastValue = this.value, scheduled = [], running = !1;
            this.schedule = function(fn) {
                return scheduled.indexOf(fn) >= 0 ? !0 : running ? !1 : (scheduled.push(fn), lastValue === self.value && (self.value = !self.value), 
                !0);
            }, new PathObserver(this, "value", function() {
                running = !0;
                for (var i = 0; i < scheduled.length; i++) {
                    var fn = scheduled[i];
                    scheduled[i] = void 0, fn();
                }
                scheduled = [], lastValue = self.value, current = next, next = self, running = !1;
            });
        }
        function ensureScheduled(fn) {
            current.schedule(fn) || next.schedule(fn);
        }
        var current, next;
        return current = new Runner(), next = new Runner(), ensureScheduled;
    }();
    document.addEventListener("DOMContentLoaded", function() {
        bootstrapTemplatesRecursivelyFrom(document), Platform.performMicrotaskCheckpoint();
    }, !1), hasTemplateElement || (global.HTMLTemplateElement = function() {
        throw TypeError("Illegal constructor");
    });
    var hasProto = "__proto__" in {}, templateContentsTable = new SideTable(), templateContentsOwnerTable = new SideTable(), templateInstanceRefTable = new SideTable();
    HTMLTemplateElement.decorate = function(el, opt_instanceRef) {
        if (el.templateIsDecorated_) return !1;
        var templateElement = el, isNative = isNativeTemplate(templateElement), bootstrapContents = isNative, liftContents = !isNative, liftRoot = !1;
        if (!isNative && isAttributeTemplate(templateElement) && (assert(!opt_instanceRef), 
        templateElement = extractTemplateFromAttributeTemplate(el), isNative = isNativeTemplate(templateElement), 
        liftRoot = !0), templateElement.templateIsDecorated_ = !0, !isNative) {
            fixTemplateElementPrototype(templateElement);
            var doc = getTemplateContentsOwner(templateElement.ownerDocument);
            templateContentsTable.set(templateElement, doc.createDocumentFragment());
        }
        return opt_instanceRef ? templateInstanceRefTable.set(templateElement, opt_instanceRef) : liftContents ? liftNonNativeTemplateChildrenIntoContent(templateElement, el, liftRoot) : bootstrapContents && bootstrapTemplatesRecursivelyFrom(templateElement.content), 
        !0;
    }, HTMLTemplateElement.bootstrap = bootstrapTemplatesRecursivelyFrom;
    var htmlElement = global.HTMLUnknownElement || HTMLElement, contentDescriptor = {
        get: function() {
            return templateContentsTable.get(this);
        },
        enumerable: !0,
        configurable: !0
    };
    hasTemplateElement || (HTMLTemplateElement.prototype = Object.create(htmlElement.prototype), 
    Object.defineProperty(HTMLTemplateElement.prototype, "content", contentDescriptor));
    var templateModelTable = new SideTable(), templateBindingDelegateTable = new SideTable(), templateSetModelFnTable = new SideTable();
    mixin(HTMLTemplateElement.prototype, {
        bind: function(name, model, path) {
            switch (name) {
              case BIND:
              case REPEAT:
              case IF:
                var templateIterator = templateIteratorTable.get(this);
                templateIterator || (templateIterator = new TemplateIterator(this), templateIteratorTable.set(this, templateIterator)), 
                templateIterator.inputs.bind(name, model, path || "");
                break;

              default:
                return Element.prototype.bind.call(this, name, model, path);
            }
        },
        unbind: function(name, model, path) {
            switch (name) {
              case BIND:
              case REPEAT:
              case IF:
                var templateIterator = templateIteratorTable.get(this);
                if (!templateIterator) break;
                templateIterator.inputs.unbind(name);
                break;

              default:
                return Element.prototype.unbind.call(this, name, model, path);
            }
        },
        unbindAll: function() {
            this.unbind(BIND), this.unbind(REPEAT), this.unbind(IF), Element.prototype.unbindAll.call(this);
        },
        createInstance: function(model, delegate) {
            var instance = createDeepCloneAndDecorateTemplates(this.ref.content, delegate);
            return "function" == typeof HTMLTemplateElement.__instanceCreated && HTMLTemplateElement.__instanceCreated(instance), 
            addBindings(instance, model, delegate), addTemplateInstanceRecord(instance, model), 
            instance;
        },
        get model() {
            return templateModelTable.get(this);
        },
        set model(model) {
            templateModelTable.set(this, model), ensureSetModelScheduled(this);
        },
        get bindingDelegate() {
            return templateBindingDelegateTable.get(this);
        },
        set bindingDelegate(bindingDelegate) {
            templateBindingDelegateTable.set(this, bindingDelegate), ensureSetModelScheduled(this);
        },
        get ref() {
            var ref, refId = this.getAttribute("ref");
            if (refId) {
                var treeScope = getTreeScope(this);
                treeScope && (ref = treeScope.getElementById(refId));
            }
            if (ref || (ref = templateInstanceRefTable.get(this)), !ref) return this;
            var nextRef = ref.ref;
            return nextRef ? nextRef : ref;
        }
    });
    var TEXT = 0, BINDING = 1, templateInstanceTable = new SideTable();
    Object.defineProperty(Node.prototype, "templateInstance", {
        get: function() {
            var instance = templateInstanceTable.get(this);
            return instance ? instance : this.parentNode ? this.parentNode.templateInstance : void 0;
        }
    }), CompoundBinding.prototype = {
        set combinator(combinator) {
            this.combinator_ = combinator, this.scheduleResolve();
        },
        bind: function(name, model, path) {
            this.unbind(name), this.size++, this.bindings[name] = new Binding(model, path, function(value) {
                this.values[name] = value, this.scheduleResolve();
            }.bind(this));
        },
        unbind: function(name, suppressResolve) {
            this.bindings[name] && (this.size--, this.bindings[name].dispose(), delete this.bindings[name], 
            delete this.values[name], suppressResolve || this.scheduleResolve());
        },
        scheduleResolve: function() {
            ensureScheduled(this.boundResolve);
        },
        resolve: function() {
            if (!this.disposed) {
                if (!this.combinator_) throw Error("CompoundBinding attempted to resolve without a combinator");
                this.value = this.combinator_(this.values);
            }
        },
        dispose: function() {
            Object.keys(this.bindings).forEach(function(name) {
                this.unbind(name, !0);
            }, this), this.disposed = !0, this.value = void 0;
        }
    }, TemplateIterator.prototype = {
        resolveInputs: function(values) {
            IF in values && !values[IF] ? this.valueChanged(void 0) : REPEAT in values ? this.valueChanged(values[REPEAT]) : BIND in values || IF in values ? this.valueChanged([ values[BIND] ]) : this.valueChanged(void 0);
        },
        valueChanged: function(value) {
            Array.isArray(value) || (value = void 0);
            var oldValue = this.iteratedValue;
            this.unobserve(), this.iteratedValue = value, this.iteratedValue && (this.arrayObserver = new ArrayObserver(this.iteratedValue, this.boundHandleSplices));
            var splices = ArrayObserver.calculateSplices(this.iteratedValue || [], oldValue || []);
            splices.length && this.handleSplices(splices), this.inputs.size || (templateIteratorTable.delete(this), 
            this.abandon());
        },
        getTerminatorAt: function(index) {
            if (-1 == index) return this.templateElement_;
            var terminator = this.terminators[index];
            if (terminator.nodeType !== Node.ELEMENT_NODE || this.templateElement_ === terminator) return terminator;
            var subIterator = templateIteratorTable.get(terminator);
            return subIterator ? subIterator.getTerminatorAt(subIterator.terminators.length - 1) : terminator;
        },
        insertInstanceAt: function(index, instanceNodes) {
            var previousTerminator = this.getTerminatorAt(index - 1), terminator = instanceNodes[instanceNodes.length - 1] || previousTerminator;
            this.terminators.splice(index, 0, terminator);
            for (var parent = this.templateElement_.parentNode, insertBeforeNode = previousTerminator.nextSibling, i = 0; i < instanceNodes.length; i++) parent.insertBefore(instanceNodes[i], insertBeforeNode);
        },
        extractInstanceAt: function(index) {
            var instanceNodes = [], previousTerminator = this.getTerminatorAt(index - 1), terminator = this.getTerminatorAt(index);
            this.terminators.splice(index, 1);
            for (var parent = this.templateElement_.parentNode; terminator !== previousTerminator; ) {
                var node = previousTerminator.nextSibling;
                node == terminator && (terminator = previousTerminator), parent.removeChild(node), 
                instanceNodes.push(node);
            }
            return instanceNodes;
        },
        getInstanceModel: function(template, model, delegate) {
            var delegateFunction = delegate && delegate[GET_INSTANCE_MODEL];
            return delegateFunction && "function" == typeof delegateFunction ? delegateFunction(template, model) : model;
        },
        getInstanceNodes: function(model, delegate, instanceCache) {
            var instanceNodes = instanceCache.get(model);
            if (instanceNodes) return instanceCache.delete(model), instanceNodes;
            instanceNodes = [];
            for (var fragment = this.templateElement_.createInstance(model, delegate); fragment.firstChild; ) instanceNodes.push(fragment.removeChild(fragment.firstChild));
            return instanceNodes;
        },
        handleSplices: function(splices) {
            var template = this.templateElement_;
            if (!template.parentNode || !template.ownerDocument.defaultView) return this.abandon(), 
            templateIteratorTable.delete(this), void 0;
            var delegate = template.bindingDelegate, instanceCache = new Map(), removeDelta = 0;
            splices.forEach(function(splice) {
                splice.removed.forEach(function(model) {
                    var instanceNodes = this.extractInstanceAt(splice.index + removeDelta, instanceNodes);
                    instanceCache.set(model, instanceNodes);
                }, this), removeDelta -= splice.addedCount;
            }, this), splices.forEach(function(splice) {
                for (var addIndex = splice.index; addIndex < splice.index + splice.addedCount; addIndex++) {
                    var model = this.getInstanceModel(template, this.iteratedValue[addIndex], delegate), instanceNodes = this.getInstanceNodes(model, delegate, instanceCache);
                    this.insertInstanceAt(addIndex, instanceNodes);
                }
            }, this), instanceCache.forEach(function(instanceNodes) {
                for (var i = 0; i < instanceNodes.length; i++) unbindAllRecursively(instanceNodes[i]);
            });
        },
        unobserve: function() {
            this.arrayObserver && (this.arrayObserver.close(), this.arrayObserver = void 0);
        },
        abandon: function() {
            this.unobserve(), this.terminators.length = 0, Object.defineProperty(this.inputs, "value", {
                configurable: !0,
                writable: !0,
                value: void 0
            }), this.inputs.dispose();
        }
    };
    var templateIteratorTable = new SideTable();
    global.CompoundBinding = CompoundBinding, HTMLTemplateElement.forAllTemplatesFrom_ = forAllTemplatesFrom, 
    HTMLTemplateElement.bindAllMustachesFrom_ = addBindings, HTMLTemplateElement.parseAndBind_ = parseAndBind;
}(this), function(root, factory) {
    
    "function" == typeof define && define.amd ? define('../lib/platform.js',[ "exports" ], factory) : "undefined" != typeof exports ? factory(exports) : factory(root.esprima = {});
}(this, function(exports) {
    
    function assert(condition, message) {
        if (!condition) throw new Error("ASSERT: " + message);
    }
    function isDecimalDigit(ch) {
        return ch >= 48 && 57 >= ch;
    }
    function isWhiteSpace(ch) {
        return 32 === ch || 9 === ch || 11 === ch || 12 === ch || 160 === ch || ch >= 5760 && " ᠎             　﻿".indexOf(String.fromCharCode(ch)) > 0;
    }
    function isLineTerminator(ch) {
        return 10 === ch || 13 === ch || 8232 === ch || 8233 === ch;
    }
    function isIdentifierStart(ch) {
        return 36 === ch || 95 === ch || ch >= 65 && 90 >= ch || ch >= 97 && 122 >= ch;
    }
    function isIdentifierPart(ch) {
        return 36 === ch || 95 === ch || ch >= 65 && 90 >= ch || ch >= 97 && 122 >= ch || ch >= 48 && 57 >= ch;
    }
    function isKeyword(id) {
        return "this" === id;
    }
    function skipWhitespace() {
        for (;length > index && isWhiteSpace(source.charCodeAt(index)); ) ++index;
    }
    function getIdentifier() {
        var start, ch;
        for (start = index++; length > index && (ch = source.charCodeAt(index), isIdentifierPart(ch)); ) ++index;
        return source.slice(start, index);
    }
    function scanIdentifier() {
        var start, id, type;
        return start = index, id = getIdentifier(), type = 1 === id.length ? Token.Identifier : isKeyword(id) ? Token.Keyword : "null" === id ? Token.NullLiteral : "true" === id || "false" === id ? Token.BooleanLiteral : Token.Identifier, 
        {
            type: type,
            value: id,
            range: [ start, index ]
        };
    }
    function scanPunctuator() {
        var code2, ch2, ch3, ch4, start = index, code = source.charCodeAt(index), ch1 = source[index];
        switch (code) {
          case 46:
          case 40:
          case 41:
          case 59:
          case 44:
          case 123:
          case 125:
          case 91:
          case 93:
          case 58:
          case 63:
          case 126:
            return ++index, {
                type: Token.Punctuator,
                value: String.fromCharCode(code),
                range: [ start, index ]
            };

          default:
            if (code2 = source.charCodeAt(index + 1), 61 === code2) switch (code) {
              case 37:
              case 38:
              case 42:
              case 43:
              case 45:
              case 47:
              case 60:
              case 62:
              case 94:
              case 124:
                return index += 2, {
                    type: Token.Punctuator,
                    value: String.fromCharCode(code) + String.fromCharCode(code2),
                    range: [ start, index ]
                };

              case 33:
              case 61:
                return index += 2, 61 === source.charCodeAt(index) && ++index, {
                    type: Token.Punctuator,
                    value: source.slice(start, index),
                    range: [ start, index ]
                };
            }
        }
        return ch2 = source[index + 1], ch3 = source[index + 2], ch4 = source[index + 3], 
        ">" === ch1 && ">" === ch2 && ">" === ch3 && "=" === ch4 ? (index += 4, {
            type: Token.Punctuator,
            value: ">>>=",
            range: [ start, index ]
        }) : ">" === ch1 && ">" === ch2 && ">" === ch3 ? (index += 3, {
            type: Token.Punctuator,
            value: ">>>",
            range: [ start, index ]
        }) : "<" === ch1 && "<" === ch2 && "=" === ch3 ? (index += 3, {
            type: Token.Punctuator,
            value: "<<=",
            range: [ start, index ]
        }) : ">" === ch1 && ">" === ch2 && "=" === ch3 ? (index += 3, {
            type: Token.Punctuator,
            value: ">>=",
            range: [ start, index ]
        }) : ch1 === ch2 && "+-<>&|".indexOf(ch1) >= 0 ? (index += 2, {
            type: Token.Punctuator,
            value: ch1 + ch2,
            range: [ start, index ]
        }) : "<>=!+-*%&|^/".indexOf(ch1) >= 0 ? (++index, {
            type: Token.Punctuator,
            value: ch1,
            range: [ start, index ]
        }) : (throwError({}, Messages.UnexpectedToken, "ILLEGAL"), void 0);
    }
    function scanNumericLiteral() {
        var number, start, ch;
        if (ch = source[index], assert(isDecimalDigit(ch.charCodeAt(0)) || "." === ch, "Numeric literal must start with a decimal digit or a decimal point"), 
        start = index, number = "", "." !== ch) {
            for (number = source[index++], ch = source[index], "0" === number && ch && isDecimalDigit(ch.charCodeAt(0)) && throwError({}, Messages.UnexpectedToken, "ILLEGAL"); isDecimalDigit(source.charCodeAt(index)); ) number += source[index++];
            ch = source[index];
        }
        if ("." === ch) {
            for (number += source[index++]; isDecimalDigit(source.charCodeAt(index)); ) number += source[index++];
            ch = source[index];
        }
        if ("e" === ch || "E" === ch) if (number += source[index++], ch = source[index], 
        ("+" === ch || "-" === ch) && (number += source[index++]), isDecimalDigit(source.charCodeAt(index))) for (;isDecimalDigit(source.charCodeAt(index)); ) number += source[index++]; else throwError({}, Messages.UnexpectedToken, "ILLEGAL");
        return isIdentifierStart(source.charCodeAt(index)) && throwError({}, Messages.UnexpectedToken, "ILLEGAL"), 
        {
            type: Token.NumericLiteral,
            value: parseFloat(number),
            range: [ start, index ]
        };
    }
    function scanStringLiteral() {
        var quote, start, ch, str = "", octal = !1;
        for (quote = source[index], assert("'" === quote || '"' === quote, "String literal must starts with a quote"), 
        start = index, ++index; length > index; ) {
            if (ch = source[index++], ch === quote) {
                quote = "";
                break;
            }
            if ("\\" === ch) if (ch = source[index++], ch && isLineTerminator(ch.charCodeAt(0))) "\r" === ch && "\n" === source[index] && ++index; else switch (ch) {
              case "n":
                str += "\n";
                break;

              case "r":
                str += "\r";
                break;

              case "t":
                str += "	";
                break;

              case "b":
                str += "\b";
                break;

              case "f":
                str += "\f";
                break;

              case "v":
                str += "";
                break;

              default:
                str += ch;
            } else {
                if (isLineTerminator(ch.charCodeAt(0))) break;
                str += ch;
            }
        }
        return "" !== quote && throwError({}, Messages.UnexpectedToken, "ILLEGAL"), {
            type: Token.StringLiteral,
            value: str,
            octal: octal,
            range: [ start, index ]
        };
    }
    function isIdentifierName(token) {
        return token.type === Token.Identifier || token.type === Token.Keyword || token.type === Token.BooleanLiteral || token.type === Token.NullLiteral;
    }
    function advance() {
        var ch;
        return skipWhitespace(), index >= length ? {
            type: Token.EOF,
            range: [ index, index ]
        } : (ch = source.charCodeAt(index), 40 === ch || 41 === ch || 58 === ch ? scanPunctuator() : 39 === ch || 34 === ch ? scanStringLiteral() : isIdentifierStart(ch) ? scanIdentifier() : 46 === ch ? isDecimalDigit(source.charCodeAt(index + 1)) ? scanNumericLiteral() : scanPunctuator() : isDecimalDigit(ch) ? scanNumericLiteral() : scanPunctuator());
    }
    function lex() {
        var token;
        return token = lookahead, index = token.range[1], lookahead = advance(), index = token.range[1], 
        token;
    }
    function peek() {
        var pos;
        pos = index, lookahead = advance(), index = pos;
    }
    function throwError(token, messageFormat) {
        var error, args = Array.prototype.slice.call(arguments, 2), msg = messageFormat.replace(/%(\d)/g, function(whole, index) {
            return assert(index < args.length, "Message reference must be in range"), args[index];
        });
        throw error = new Error(msg), error.index = index, error.description = msg, error;
    }
    function throwUnexpected(token) {
        throwError(token, Messages.UnexpectedToken, token.value);
    }
    function expect(value) {
        var token = lex();
        (token.type !== Token.Punctuator || token.value !== value) && throwUnexpected(token);
    }
    function match(value) {
        return lookahead.type === Token.Punctuator && lookahead.value === value;
    }
    function matchKeyword(keyword) {
        return lookahead.type === Token.Keyword && lookahead.value === keyword;
    }
    function consumeSemicolon() {
        return 59 === source.charCodeAt(index) ? (lex(), void 0) : (skipWhitespace(), match(";") ? (lex(), 
        void 0) : (lookahead.type === Token.EOF || match("}") || throwUnexpected(lookahead), 
        void 0));
    }
    function parseArrayInitialiser() {
        var elements = [];
        for (expect("["); !match("]"); ) match(",") ? (lex(), elements.push(null)) : (elements.push(parseAssignmentExpression()), 
        match("]") || expect(","));
        return expect("]"), delegate.createArrayExpression(elements);
    }
    function parseObjectPropertyKey() {
        var token;
        return skipWhitespace(), token = lex(), token.type === Token.StringLiteral || token.type === Token.NumericLiteral ? delegate.createLiteral(token) : delegate.createIdentifier(token.value);
    }
    function parseObjectProperty() {
        var token, key;
        return token = lookahead, skipWhitespace(), (token.type === Token.EOF || token.type === Token.Punctuator) && throwUnexpected(token), 
        key = parseObjectPropertyKey(), expect(":"), delegate.createProperty("init", key, parseAssignmentExpression());
    }
    function parseObjectInitialiser() {
        var properties = [];
        for (expect("{"); !match("}"); ) properties.push(parseObjectProperty()), match("}") || expect(",");
        return expect("}"), delegate.createObjectExpression(properties);
    }
    function parseGroupExpression() {
        var expr;
        return expect("("), expr = parseExpression(), expect(")"), expr;
    }
    function parsePrimaryExpression() {
        var type, token, expr;
        return match("(") ? parseGroupExpression() : (type = lookahead.type, type === Token.Identifier ? expr = delegate.createIdentifier(lex().value) : type === Token.StringLiteral || type === Token.NumericLiteral ? expr = delegate.createLiteral(lex()) : type === Token.Keyword ? matchKeyword("this") && (lex(), 
        expr = delegate.createThisExpression()) : type === Token.BooleanLiteral ? (token = lex(), 
        token.value = "true" === token.value, expr = delegate.createLiteral(token)) : type === Token.NullLiteral ? (token = lex(), 
        token.value = null, expr = delegate.createLiteral(token)) : match("[") ? expr = parseArrayInitialiser() : match("{") && (expr = parseObjectInitialiser()), 
        expr ? expr : (throwUnexpected(lex()), void 0));
    }
    function parseArguments() {
        var args = [];
        if (expect("("), !match(")")) for (;length > index && (args.push(parseAssignmentExpression()), 
        !match(")")); ) expect(",");
        return expect(")"), args;
    }
    function parseNonComputedProperty() {
        var token;
        return token = lex(), isIdentifierName(token) || throwUnexpected(token), delegate.createIdentifier(token.value);
    }
    function parseNonComputedMember() {
        return expect("."), parseNonComputedProperty();
    }
    function parseComputedMember() {
        var expr;
        return expect("["), expr = parseExpression(), expect("]"), expr;
    }
    function parseLeftHandSideExpressionAllowCall() {
        var expr, args, property;
        for (expr = parsePrimaryExpression(); match(".") || match("[") || match("("); ) match("(") ? (args = parseArguments(), 
        expr = delegate.createCallExpression(expr, args)) : match("[") ? (property = parseComputedMember(), 
        expr = delegate.createMemberExpression("[", expr, property)) : (property = parseNonComputedMember(), 
        expr = delegate.createMemberExpression(".", expr, property));
        return expr;
    }
    function parsePostfixExpression() {
        var expr;
        return expr = parseLeftHandSideExpressionAllowCall(), lookahead.type === Token.Punctuator && (match("++") || match("--")) && throwError({}, Messages.UnexpectedToken), 
        expr;
    }
    function parseUnaryExpression() {
        var token, expr;
        return lookahead.type !== Token.Punctuator && lookahead.type !== Token.Keyword ? expr = parsePostfixExpression() : match("++") || match("--") ? throwError({}, Messages.UnexpectedToken) : match("+") || match("-") || match("~") || match("!") ? (token = lex(), 
        expr = parseUnaryExpression(), expr = delegate.createUnaryExpression(token.value, expr)) : matchKeyword("delete") || matchKeyword("void") || matchKeyword("typeof") ? throwError({}, Messages.UnexpectedToken) : expr = parsePostfixExpression(), 
        expr;
    }
    function binaryPrecedence(token, allowIn) {
        var prec = 0;
        if (token.type !== Token.Punctuator && token.type !== Token.Keyword) return 0;
        switch (token.value) {
          case "||":
            prec = 1;
            break;

          case "&&":
            prec = 2;
            break;

          case "|":
            prec = 3;
            break;

          case "^":
            prec = 4;
            break;

          case "&":
            prec = 5;
            break;

          case "==":
          case "!=":
          case "===":
          case "!==":
            prec = 6;
            break;

          case "<":
          case ">":
          case "<=":
          case ">=":
          case "instanceof":
            prec = 7;
            break;

          case "in":
            prec = allowIn ? 7 : 0;
            break;

          case "<<":
          case ">>":
          case ">>>":
            prec = 8;
            break;

          case "+":
          case "-":
            prec = 9;
            break;

          case "*":
          case "/":
          case "%":
            prec = 11;
        }
        return prec;
    }
    function parseBinaryExpression() {
        var expr, token, prec, previousAllowIn, stack, right, operator, left, i;
        if (previousAllowIn = state.allowIn, state.allowIn = !0, left = parseUnaryExpression(), 
        token = lookahead, prec = binaryPrecedence(token, previousAllowIn), 0 === prec) return left;
        for (token.prec = prec, lex(), right = parseUnaryExpression(), stack = [ left, token, right ]; (prec = binaryPrecedence(lookahead, previousAllowIn)) > 0; ) {
            for (;stack.length > 2 && prec <= stack[stack.length - 2].prec; ) right = stack.pop(), 
            operator = stack.pop().value, left = stack.pop(), expr = delegate.createBinaryExpression(operator, left, right), 
            stack.push(expr);
            token = lex(), token.prec = prec, stack.push(token), expr = parseUnaryExpression(), 
            stack.push(expr);
        }
        for (state.allowIn = previousAllowIn, i = stack.length - 1, expr = stack[i]; i > 1; ) expr = delegate.createBinaryExpression(stack[i - 1].value, stack[i - 2], expr), 
        i -= 2;
        return expr;
    }
    function parseConditionalExpression() {
        var expr, previousAllowIn, consequent, alternate;
        return expr = parseBinaryExpression(), match("?") && (lex(), previousAllowIn = state.allowIn, 
        state.allowIn = !0, consequent = parseAssignmentExpression(), state.allowIn = previousAllowIn, 
        expect(":"), alternate = parseAssignmentExpression(), expr = delegate.createConditionalExpression(expr, consequent, alternate)), 
        expr;
    }
    function parseAssignmentExpression() {
        var token, left, node;
        return token = lookahead, node = left = parseConditionalExpression();
    }
    function parseExpression() {
        var expr;
        return expr = parseAssignmentExpression();
    }
    function parseEmptyStatement() {
        return expect(";"), delegate.createEmptyStatement();
    }
    function parseExpressionStatement() {
        var expr = parseExpression();
        return consumeSemicolon(), delegate.createExpressionStatement(expr);
    }
    function parseStatement() {
        var expr, labeledBody, key, type = lookahead.type;
        if (type === Token.EOF && throwUnexpected(lookahead), skipWhitespace(), type === Token.Punctuator) switch (lookahead.value) {
          case ";":
            return parseEmptyStatement();

          case "(":
            return parseExpressionStatement();
        }
        return expr = parseExpression(), expr.type === Syntax.Identifier && match(":") ? (lex(), 
        key = "$" + expr.name, Object.prototype.hasOwnProperty.call(state.labelSet, key) && throwError({}, Messages.Redeclaration, "Label", expr.name), 
        state.labelSet[key] = !0, labeledBody = parseStatement(), delete state.labelSet[key], 
        delegate.createLabeledStatement(expr, labeledBody)) : (consumeSemicolon(), delegate.createExpressionStatement(expr));
    }
    function parseSourceElement() {
        return lookahead.type === Token.Keyword ? parseStatement() : lookahead.type !== Token.EOF ? parseStatement() : void 0;
    }
    function parseSourceElements() {
        for (var sourceElement, sourceElements = []; length > index && (sourceElement = parseSourceElement(), 
        "undefined" != typeof sourceElement); ) sourceElements.push(sourceElement);
        return sourceElements;
    }
    function parseProgram() {
        var body;
        return skipWhitespace(), peek(), body = parseSourceElements(), delegate.createProgram(body);
    }
    function parse(code, inDelegate) {
        var toString;
        return toString = String, "string" == typeof code || code instanceof String || (code = toString(code)), 
        delegate = inDelegate, source = code, index = 0, length = source.length, lookahead = null, 
        state = {
            allowIn: !0,
            labelSet: {}
        }, length > 0 && "undefined" == typeof source[0] && code instanceof String && (source = code.valueOf()), 
        parseProgram();
    }
    var Token, TokenName, Syntax, Messages, source, index, length, delegate, lookahead, state;
    Token = {
        BooleanLiteral: 1,
        EOF: 2,
        Identifier: 3,
        Keyword: 4,
        NullLiteral: 5,
        NumericLiteral: 6,
        Punctuator: 7,
        StringLiteral: 8
    }, TokenName = {}, TokenName[Token.BooleanLiteral] = "Boolean", TokenName[Token.EOF] = "<end>", 
    TokenName[Token.Identifier] = "Identifier", TokenName[Token.Keyword] = "Keyword", 
    TokenName[Token.NullLiteral] = "Null", TokenName[Token.NumericLiteral] = "Numeric", 
    TokenName[Token.Punctuator] = "Punctuator", TokenName[Token.StringLiteral] = "String", 
    Syntax = {
        ArrayExpression: "ArrayExpression",
        BinaryExpression: "BinaryExpression",
        CallExpression: "CallExpression",
        ConditionalExpression: "ConditionalExpression",
        EmptyStatement: "EmptyStatement",
        ExpressionStatement: "ExpressionStatement",
        Identifier: "Identifier",
        Literal: "Literal",
        LabeledStatement: "LabeledStatement",
        LogicalExpression: "LogicalExpression",
        MemberExpression: "MemberExpression",
        ObjectExpression: "ObjectExpression",
        Program: "Program",
        Property: "Property",
        ThisExpression: "ThisExpression",
        UnaryExpression: "UnaryExpression"
    }, Messages = {
        UnexpectedToken: "Unexpected token %0",
        UnknownLabel: "Undefined label '%0'",
        Redeclaration: "%0 '%1' has already been declared"
    }, exports.parse = parse;
}), function(global) {
    
    function getNamedScopeBinding(model, pathString, name, node) {
        if (node.nodeType === Node.ELEMENT_NODE && "TEMPLATE" === node.tagName && ("bind" === name || "repeat" === name)) {
            var ident, expressionText, match = pathString.match(repeatPattern);
            if (match ? (ident = match[1], expressionText = match[2]) : (match = pathString.match(bindPattern), 
            match && (ident = match[2], expressionText = match[1])), match) {
                var binding;
                if (expressionText = expressionText.trim(), expressionText.match(pathPattern)) binding = new CompoundBinding(function(values) {
                    return values.path;
                }), binding.bind("path", model, expressionText); else try {
                    binding = getExpressionBinding(model, expressionText);
                } catch (ex) {
                    console.error("Invalid expression syntax: " + expressionText, ex);
                }
                if (binding) return templateScopeTable.set(node, ident), binding;
            }
        }
    }
    function getExpressionBinding(model, expressionText) {
        try {
            var delegate = new ASTDelegate();
            if (esprima.parse(expressionText, delegate), !delegate.statements.length && !delegate.labeledStatements.length) return;
            if (!delegate.labeledStatements.length && delegate.statements.length > 1) throw Error("Multiple unlabelled statements are not allowed.");
            var resolveFn = delegate.labeledStatements.length ? newLabeledResolve(delegate.labeledStatements) : resolveFn = delegate.statements[0], paths = [];
            for (var prop in delegate.deps) paths.push(prop);
            if (!paths.length) return {
                value: resolveFn({})
            };
            for (var binding = new CompoundBinding(resolveFn), i = 0; i < paths.length; i++) binding.bind(paths[i], model, paths[i]);
            return binding;
        } catch (ex) {
            console.error("Invalid expression syntax: " + expressionText, ex);
        }
    }
    function newLabeledResolve(labeledStatements) {
        return function(values) {
            for (var labels = [], i = 0; i < labeledStatements.length; i++) labeledStatements[i].body(values) && labels.push(labeledStatements[i].label);
            return labels.join(" ");
        };
    }
    function IdentPath(deps, name, last) {
        this.deps = deps, this.name = name, this.last = last;
    }
    function ASTDelegate() {
        this.statements = [], this.labeledStatements = [], this.deps = {}, this.currentPath = void 0;
    }
    function notImplemented() {
        throw Error("Not Implemented");
    }
    function ExpressionSyntax() {}
    var SideTable;
    "undefined" != typeof WeakMap && navigator.userAgent.indexOf("Firefox/") < 0 ? SideTable = WeakMap : function() {
        var defineProperty = Object.defineProperty, hasOwnProperty = Object.hasOwnProperty, counter = new Date().getTime() % 1e9;
        SideTable = function() {
            this.name = "__st" + (1e9 * Math.random() >>> 0) + (counter++ + "__");
        }, SideTable.prototype = {
            set: function(key, value) {
                defineProperty(key, this.name, {
                    value: value,
                    writable: !0
                });
            },
            get: function(key) {
                return hasOwnProperty.call(key, this.name) ? key[this.name] : void 0;
            },
            "delete": function(key) {
                this.set(key, void 0);
            }
        };
    }();
    var identStart = "[$_a-zA-Z]", identPart = "[$_a-zA-Z0-9]", ident = identStart + "+" + identPart + "*", capturedIdent = "(" + ident + ")", elementIndex = "(?:[0-9]|[1-9]+[0-9]+)", identOrElementIndex = "(?:" + ident + "|" + elementIndex + ")", path = "(?:" + identOrElementIndex + ")(?:\\." + identOrElementIndex + ")*", pathPattern = new RegExp("^" + path + "$"), repeatPattern = new RegExp("^" + capturedIdent + "\\s* in (.*)$"), bindPattern = new RegExp("^(.*) as \\s*" + capturedIdent + "$"), templateScopeTable = new SideTable();
    IdentPath.prototype = {
        getPath: function() {
            return this.last ? this.last.getPath() + "." + this.name : this.name;
        },
        valueFn: function() {
            var path = this.getPath();
            return this.deps[path] = !0, function(values) {
                return values[path];
            };
        }
    };
    var unaryOperators = {
        "+": function(v) {
            return +v;
        },
        "-": function(v) {
            return -v;
        },
        "!": function(v) {
            return !v;
        }
    }, binaryOperators = {
        "+": function(l, r) {
            return l + r;
        },
        "-": function(l, r) {
            return l - r;
        },
        "*": function(l, r) {
            return l * r;
        },
        "/": function(l, r) {
            return l / r;
        },
        "%": function(l, r) {
            return l % r;
        },
        "<": function(l, r) {
            return r > l;
        },
        ">": function(l, r) {
            return l > r;
        },
        "<=": function(l, r) {
            return r >= l;
        },
        ">=": function(l, r) {
            return l >= r;
        },
        "==": function(l, r) {
            return l == r;
        },
        "!=": function(l, r) {
            return l != r;
        },
        "===": function(l, r) {
            return l === r;
        },
        "!==": function(l, r) {
            return l !== r;
        },
        "&&": function(l, r) {
            return l && r;
        },
        "||": function(l, r) {
            return l || r;
        }
    };
    ASTDelegate.prototype = {
        getFn: function(arg) {
            return arg instanceof IdentPath ? arg.valueFn() : arg;
        },
        createProgram: function() {},
        createExpressionStatement: function(statement) {
            return this.statements.push(statement), statement;
        },
        createLabeledStatement: function(label, body) {
            return this.labeledStatements.push({
                label: label.getPath(),
                body: body instanceof IdentPath ? body.valueFn() : body
            }), body;
        },
        createUnaryExpression: function(op, argument) {
            if (!unaryOperators[op]) throw Error("Disallowed operator: " + op);
            return argument = this.getFn(argument), function(values) {
                return unaryOperators[op](argument(values));
            };
        },
        createBinaryExpression: function(op, left, right) {
            if (!binaryOperators[op]) throw Error("Disallowed operator: " + op);
            return left = this.getFn(left), right = this.getFn(right), function(values) {
                return binaryOperators[op](left(values), right(values));
            };
        },
        createConditionalExpression: function(test, consequent, alternate) {
            return test = this.getFn(test), consequent = this.getFn(consequent), alternate = this.getFn(alternate), 
            function(values) {
                return test(values) ? consequent(values) : alternate(values);
            };
        },
        createIdentifier: function(name) {
            var ident = new IdentPath(this.deps, name);
            return ident.type = "Identifier", ident;
        },
        createMemberExpression: function(accessor, object, property) {
            return new IdentPath(this.deps, property.name, object);
        },
        createLiteral: function(token) {
            return function() {
                return token.value;
            };
        },
        createArrayExpression: function(elements) {
            for (var i = 0; i < elements.length; i++) elements[i] = this.getFn(elements[i]);
            return function(values) {
                for (var arr = [], i = 0; i < elements.length; i++) arr.push(elements[i](values));
                return arr;
            };
        },
        createProperty: function(kind, key, value) {
            return {
                key: key instanceof IdentPath ? key.getPath() : key(),
                value: value
            };
        },
        createObjectExpression: function(properties) {
            for (var i = 0; i < properties.length; i++) properties[i].value = this.getFn(properties[i].value);
            return function(values) {
                for (var obj = {}, i = 0; i < properties.length; i++) obj[properties[i].key] = properties[i].value(values);
                return obj;
            };
        },
        createCallExpression: notImplemented,
        createEmptyStatement: notImplemented,
        createThisExpression: notImplemented
    }, ExpressionSyntax.prototype = {
        getBinding: function(model, pathString, name, node) {
            return pathString = pathString.trim(), pathString && !pathString.match(pathPattern) ? getNamedScopeBinding(model, pathString, name, node) || getExpressionBinding(model, pathString, name, node) : void 0;
        },
        getInstanceModel: function(template, model) {
            var scopeName = templateScopeTable.get(template);
            if (!scopeName) return model;
            var parentScope = template.templateInstance ? template.templateInstance.model : template.model, scope = Object.create(parentScope);
            return scope[scopeName] = model, scope;
        }
    }, global.ExpressionSyntax = ExpressionSyntax;
}(this), function(scope) {
    function dirtyCheck() {
        logFlags.data && console.group("Model.dirtyCheck()"), check(), logFlags.data && console.groupEnd();
    }
    function check() {
        Platform.performMicrotaskCheckpoint();
    }
    var style = document.createElement("style");
    style.textContent = "template {display: none;} /* injected by platform.js */";
    var head = document.querySelector("head");
    head.insertBefore(style, head.firstChild), HTMLTemplateElement.__instanceCreated = function(inNode) {
        document.adoptNode(inNode), CustomElements.upgradeAll(inNode);
    };
    var dirtyCheckPollInterval = 125;
    window.addEventListener("WebComponentsReady", function() {
        dirtyCheck(), Observer.hasObjectObserve || setInterval(check, dirtyCheckPollInterval);
    }), scope.flush = dirtyCheck, window.dirtyCheck = dirtyCheck;
}(window.Platform), function(scope) {
    function isDocumentLink(elt) {
        return isLinkRel(elt, IMPORT_LINK_TYPE);
    }
    function isStylesheetLink(elt) {
        return isLinkRel(elt, STYLE_LINK_TYPE);
    }
    function isLinkRel(elt, rel) {
        return "link" === elt.localName && elt.getAttribute("rel") === rel;
    }
    function isScript(elt) {
        return "script" === elt.localName;
    }
    function makeDocument(inHTML, inUrl) {
        var doc = document.implementation.createHTMLDocument(IMPORT_LINK_TYPE);
        doc._URL = inUrl;
        var base = doc.createElement("base");
        return base.setAttribute("href", document.baseURI), doc.head.appendChild(base), 
        doc.body.innerHTML = inHTML, window.HTMLTemplateElement && HTMLTemplateElement.bootstrap && HTMLTemplateElement.bootstrap(doc), 
        doc;
    }
    scope || (scope = window.HTMLImports = {
        flags: {}
    });
    var loader, xhr = scope.xhr, IMPORT_LINK_TYPE = "import", STYLE_LINK_TYPE = "stylesheet", importer = {
        documents: {},
        cache: {},
        preloadSelectors: [ "link[rel=" + IMPORT_LINK_TYPE + "]", "element link[rel=" + STYLE_LINK_TYPE + "]", "template", "script[src]:not([type])", 'script[src][type="text/javascript"]' ].join(","),
        loader: function(inNext) {
            return loader = new Loader(importer.loaded, inNext), loader.cache = importer.cache, 
            loader;
        },
        load: function(inDocument, inNext) {
            loader = importer.loader(inNext), importer.preload(inDocument);
        },
        preload: function(inDocument) {
            var nodes = inDocument.querySelectorAll(importer.preloadSelectors);
            nodes = this.filterMainDocumentNodes(inDocument, nodes), nodes = this.extractTemplateNodes(nodes), 
            loader.addNodes(nodes);
        },
        filterMainDocumentNodes: function(inDocument, nodes) {
            return inDocument === document && (nodes = Array.prototype.filter.call(nodes, function(n) {
                return !isScript(n);
            })), nodes;
        },
        extractTemplateNodes: function(nodes) {
            var extra = [];
            return nodes = Array.prototype.filter.call(nodes, function(n) {
                if ("template" === n.localName) {
                    if (n.content) {
                        var l$ = n.content.querySelectorAll("link[rel=" + STYLE_LINK_TYPE + "]");
                        l$.length && (extra = extra.concat(Array.prototype.slice.call(l$, 0)));
                    }
                    return !1;
                }
                return !0;
            }), extra.length && (nodes = nodes.concat(extra)), nodes;
        },
        loaded: function(url, elt, resource) {
            if (isDocumentLink(elt)) {
                var document = importer.documents[url];
                document || (document = makeDocument(resource, url), path.resolvePathsInHTML(document.body), 
                importer.documents[url] = document, importer.preload(document)), elt.import = {
                    href: url,
                    ownerNode: elt,
                    content: document
                }, elt.content = resource = document;
            }
            elt.__resource = resource, isStylesheetLink(elt) && path.resolvePathsInStylesheet(elt);
        }
    }, Loader = function(inOnLoad, inOnComplete) {
        this.onload = inOnLoad, this.oncomplete = inOnComplete, this.inflight = 0, this.pending = {}, 
        this.cache = {};
    };
    Loader.prototype = {
        addNodes: function(inNodes) {
            this.inflight += inNodes.length, forEach(inNodes, this.require, this), this.checkDone();
        },
        require: function(inElt) {
            var url = path.nodeUrl(inElt);
            inElt.__nodeUrl = url, this.dedupe(url, inElt) || this.fetch(url, inElt);
        },
        dedupe: function(inUrl, inElt) {
            return this.pending[inUrl] ? (this.pending[inUrl].push(inElt), !0) : this.cache[inUrl] ? (this.onload(inUrl, inElt, loader.cache[inUrl]), 
            this.tail(), !0) : (this.pending[inUrl] = [ inElt ], !1);
        },
        fetch: function(url, elt) {
            var receiveXhr = function(err, resource) {
                this.receive(url, elt, err, resource);
            }.bind(this);
            xhr.load(url, receiveXhr);
        },
        receive: function(inUrl, inElt, inErr, inResource) {
            inErr || (loader.cache[inUrl] = inResource), loader.pending[inUrl].forEach(function(e) {
                inErr || this.onload(inUrl, e, inResource), this.tail();
            }, this), loader.pending[inUrl] = null;
        },
        tail: function() {
            --this.inflight, this.checkDone();
        },
        checkDone: function() {
            this.inflight || this.oncomplete();
        }
    };
    var URL_ATTRS = [ "href", "src", "action" ], URL_ATTRS_SELECTOR = "[" + URL_ATTRS.join("],[") + "]", URL_TEMPLATE_SEARCH = "{{.*}}", path = {
        nodeUrl: function(inNode) {
            return path.resolveUrl(path.getDocumentUrl(document), path.hrefOrSrc(inNode));
        },
        hrefOrSrc: function(inNode) {
            return inNode.getAttribute("href") || inNode.getAttribute("src");
        },
        documentUrlFromNode: function(inNode) {
            return path.getDocumentUrl(inNode.ownerDocument);
        },
        getDocumentUrl: function(inDocument) {
            var url = inDocument && (inDocument._URL || inDocument.impl && inDocument.impl._URL || inDocument.baseURI || inDocument.URL) || "";
            return url.split("#")[0];
        },
        resolveUrl: function(inBaseUrl, inUrl, inRelativeToDocument) {
            if (this.isAbsUrl(inUrl)) return inUrl;
            var url = this.compressUrl(this.urlToPath(inBaseUrl) + inUrl);
            return inRelativeToDocument && (url = path.makeRelPath(path.getDocumentUrl(document), url)), 
            url;
        },
        isAbsUrl: function(inUrl) {
            return /(^data:)|(^http[s]?:)|(^\/)/.test(inUrl);
        },
        urlToPath: function(inBaseUrl) {
            var parts = inBaseUrl.split("/");
            return parts.pop(), parts.push(""), parts.join("/");
        },
        compressUrl: function(inUrl) {
            for (var p, parts = inUrl.split("/"), i = 0; i < parts.length; i++) p = parts[i], 
            ".." === p && (parts.splice(i - 1, 2), i -= 2);
            return parts.join("/");
        },
        makeRelPath: function(inSource, inTarget) {
            var s, t;
            for (s = this.compressUrl(inSource).split("/"), t = this.compressUrl(inTarget).split("/"); s.length && s[0] === t[0]; ) s.shift(), 
            t.shift();
            for (var i = 0, l = s.length - 1; l > i; i++) t.unshift("..");
            var r = t.join("/");
            return r;
        },
        resolvePathsInHTML: function(root, url) {
            url = url || path.documentUrlFromNode(root), path.resolveAttributes(root, url), 
            path.resolveStyleElts(root, url);
            var templates = root.querySelectorAll("template");
            templates && forEach(templates, function(t) {
                t.content && path.resolvePathsInHTML(t.content, url);
            });
        },
        resolvePathsInStylesheet: function(inSheet) {
            var docUrl = path.nodeUrl(inSheet);
            inSheet.__resource = path.resolveCssText(inSheet.__resource, docUrl);
        },
        resolveStyleElts: function(inRoot, inUrl) {
            var styles = inRoot.querySelectorAll("style");
            styles && forEach(styles, function(style) {
                style.textContent = path.resolveCssText(style.textContent, inUrl);
            });
        },
        resolveCssText: function(inCssText, inBaseUrl) {
            return inCssText.replace(/url\([^)]*\)/g, function(inMatch) {
                var urlPath = inMatch.replace(/["']/g, "").slice(4, -1);
                return urlPath = path.resolveUrl(inBaseUrl, urlPath, !0), "url(" + urlPath + ")";
            });
        },
        resolveAttributes: function(inRoot, inUrl) {
            var nodes = inRoot && inRoot.querySelectorAll(URL_ATTRS_SELECTOR);
            nodes && forEach(nodes, function(n) {
                this.resolveNodeAttributes(n, inUrl);
            }, this);
        },
        resolveNodeAttributes: function(inNode, inUrl) {
            URL_ATTRS.forEach(function(v) {
                var attr = inNode.attributes[v];
                if (attr && attr.value && attr.value.search(URL_TEMPLATE_SEARCH) < 0) {
                    var urlPath = path.resolveUrl(inUrl, attr.value, !0);
                    attr.value = urlPath;
                }
            });
        }
    };
    xhr = xhr || {
        async: !0,
        ok: function(inRequest) {
            return inRequest.status >= 200 && inRequest.status < 300 || 304 === inRequest.status || 0 === inRequest.status;
        },
        load: function(url, next, nextContext) {
            var request = new XMLHttpRequest();
            (scope.flags.debug || scope.flags.bust) && (url += "?" + Math.random()), request.open("GET", url, xhr.async), 
            request.addEventListener("readystatechange", function() {
                4 === request.readyState && next.call(nextContext, !xhr.ok(request) && request, request.response, url);
            }), request.send();
        }
    };
    var forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach);
    scope.path = path, scope.xhr = xhr, scope.importer = importer, scope.getDocumentUrl = path.getDocumentUrl, 
    scope.IMPORT_LINK_TYPE = IMPORT_LINK_TYPE;
}(window.HTMLImports), function(scope) {
    function isDocumentLink(elt) {
        return "link" === elt.localName && elt.getAttribute("rel") === IMPORT_LINK_TYPE;
    }
    function needsMainDocumentContext(node) {
        return node.parentNode && !inMainDocument(node) && !isElementElementChild(node);
    }
    function inMainDocument(elt) {
        return elt.ownerDocument === document || elt.ownerDocument.impl === document;
    }
    function isElementElementChild(elt) {
        return elt.parentNode && "element" === elt.parentNode.localName;
    }
    var IMPORT_LINK_TYPE = "import", importParser = {
        selectors: [ "link[rel=" + IMPORT_LINK_TYPE + "]", "link[rel=stylesheet]", "style", "script:not([type])", 'script[type="text/javascript"]' ],
        map: {
            link: "parseLink",
            script: "parseScript",
            style: "parseGeneric"
        },
        parse: function(inDocument) {
            if (!inDocument.__importParsed) {
                inDocument.__importParsed = !0;
                var elts = inDocument.querySelectorAll(importParser.selectors);
                forEach(elts, function(e) {
                    importParser[importParser.map[e.localName]](e);
                });
            }
        },
        parseLink: function(linkElt) {
            isDocumentLink(linkElt) ? linkElt.content && importParser.parse(linkElt.content) : this.parseGeneric(linkElt);
        },
        parseGeneric: function(elt) {
            needsMainDocumentContext(elt) && document.head.appendChild(elt);
        },
        parseScript: function(scriptElt) {
            if (needsMainDocumentContext(scriptElt)) {
                var code = (scriptElt.__resource || scriptElt.textContent).trim();
                if (code) {
                    var moniker = scriptElt.__nodeUrl;
                    if (!moniker) {
                        var moniker = scope.path.documentUrlFromNode(scriptElt), tag = "[" + Math.floor(1e3 * (Math.random() + 1)) + "]", matches = code.match(/Polymer\(['"]([^'"]*)/);
                        tag = matches && matches[1] || tag, moniker += "/" + tag + ".js";
                    }
                    code += "\n//# sourceURL=" + moniker + "\n", eval.call(window, code);
                }
            }
        }
    }, forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach);
    scope.parser = importParser;
}(HTMLImports), function() {
    function bootstrap() {
        HTMLImports.importer.load(document, function() {
            HTMLImports.parser.parse(document), HTMLImports.readyTime = new Date().getTime(), 
            document.dispatchEvent(new CustomEvent("HTMLImportsLoaded", {
                bubbles: !0
            }));
        });
    }
    "function" != typeof window.CustomEvent && (window.CustomEvent = function(inType) {
        var e = document.createEvent("HTMLEvents");
        return e.initEvent(inType, !0, !0), e;
    }), "complete" === document.readyState ? bootstrap() : window.addEventListener("DOMContentLoaded", bootstrap);
}(), function(global) {
    function scheduleCallback(observer) {
        scheduledObservers.push(observer), isScheduled || (isScheduled = !0, setImmediate(dispatchCallbacks));
    }
    function wrapIfNeeded(node) {
        return window.ShadowDOMPolyfill && window.ShadowDOMPolyfill.wrapIfNeeded(node) || node;
    }
    function dispatchCallbacks() {
        isScheduled = !1;
        var observers = scheduledObservers;
        scheduledObservers = [], observers.sort(function(o1, o2) {
            return o1.uid_ - o2.uid_;
        });
        var anyNonEmpty = !1;
        observers.forEach(function(observer) {
            var queue = observer.takeRecords();
            removeTransientObserversFor(observer), queue.length && (observer.callback_(queue, observer), 
            anyNonEmpty = !0);
        }), anyNonEmpty && dispatchCallbacks();
    }
    function removeTransientObserversFor(observer) {
        observer.nodes_.forEach(function(node) {
            var registrations = registrationsTable.get(node);
            registrations && registrations.forEach(function(registration) {
                registration.observer === observer && registration.removeTransientObservers();
            });
        });
    }
    function forEachAncestorAndObserverEnqueueRecord(target, callback) {
        for (var node = target; node; node = node.parentNode) {
            var registrations = registrationsTable.get(node);
            if (registrations) for (var j = 0; j < registrations.length; j++) {
                var registration = registrations[j], options = registration.options;
                if (node === target || options.subtree) {
                    var record = callback(options);
                    record && registration.enqueue(record);
                }
            }
        }
    }
    function JsMutationObserver(callback) {
        this.callback_ = callback, this.nodes_ = [], this.records_ = [], this.uid_ = ++uidCounter;
    }
    function MutationRecord(type, target) {
        this.type = type, this.target = target, this.addedNodes = [], this.removedNodes = [], 
        this.previousSibling = null, this.nextSibling = null, this.attributeName = null, 
        this.attributeNamespace = null, this.oldValue = null;
    }
    function copyMutationRecord(original) {
        var record = new MutationRecord(original.type, original.target);
        return record.addedNodes = original.addedNodes.slice(), record.removedNodes = original.removedNodes.slice(), 
        record.previousSibling = original.previousSibling, record.nextSibling = original.nextSibling, 
        record.attributeName = original.attributeName, record.attributeNamespace = original.attributeNamespace, 
        record.oldValue = original.oldValue, record;
    }
    function getRecord(type, target) {
        return currentRecord = new MutationRecord(type, target);
    }
    function getRecordWithOldValue(oldValue) {
        return recordWithOldValue ? recordWithOldValue : (recordWithOldValue = copyMutationRecord(currentRecord), 
        recordWithOldValue.oldValue = oldValue, recordWithOldValue);
    }
    function clearRecords() {
        currentRecord = recordWithOldValue = void 0;
    }
    function recordRepresentsCurrentMutation(record) {
        return record === recordWithOldValue || record === currentRecord;
    }
    function selectRecord(lastRecord, newRecord) {
        return lastRecord === newRecord ? lastRecord : recordWithOldValue && recordRepresentsCurrentMutation(lastRecord) ? recordWithOldValue : null;
    }
    function Registration(observer, target, options) {
        this.observer = observer, this.target = target, this.options = options, this.transientObservedNodes = [];
    }
    var registrationsTable = new SideTable(), setImmediate = window.msSetImmediate;
    if (!setImmediate) {
        var setImmediateQueue = [], sentinel = String(Math.random());
        window.addEventListener("message", function(e) {
            if (e.data === sentinel) {
                var queue = setImmediateQueue;
                setImmediateQueue = [], queue.forEach(function(func) {
                    func();
                });
            }
        }), setImmediate = function(func) {
            setImmediateQueue.push(func), window.postMessage(sentinel, "*");
        };
    }
    var isScheduled = !1, scheduledObservers = [], uidCounter = 0;
    JsMutationObserver.prototype = {
        observe: function(target, options) {
            if (target = wrapIfNeeded(target), !options.childList && !options.attributes && !options.characterData || options.attributeOldValue && !options.attributes || options.attributeFilter && options.attributeFilter.length && !options.attributes || options.characterDataOldValue && !options.characterData) throw new SyntaxError();
            var registrations = registrationsTable.get(target);
            registrations || registrationsTable.set(target, registrations = []);
            for (var registration, i = 0; i < registrations.length; i++) if (registrations[i].observer === this) {
                registration = registrations[i], registration.removeListeners(), registration.options = options;
                break;
            }
            registration || (registration = new Registration(this, target, options), registrations.push(registration), 
            this.nodes_.push(target)), registration.addListeners();
        },
        disconnect: function() {
            this.nodes_.forEach(function(node) {
                for (var registrations = registrationsTable.get(node), i = 0; i < registrations.length; i++) {
                    var registration = registrations[i];
                    if (registration.observer === this) {
                        registration.removeListeners(), registrations.splice(i, 1);
                        break;
                    }
                }
            }, this), this.records_ = [];
        },
        takeRecords: function() {
            var copyOfRecords = this.records_;
            return this.records_ = [], copyOfRecords;
        }
    };
    var currentRecord, recordWithOldValue;
    Registration.prototype = {
        enqueue: function(record) {
            var records = this.observer.records_, length = records.length;
            if (records.length > 0) {
                var lastRecord = records[length - 1], recordToReplaceLast = selectRecord(lastRecord, record);
                if (recordToReplaceLast) return records[length - 1] = recordToReplaceLast, void 0;
            } else scheduleCallback(this.observer);
            records[length] = record;
        },
        addListeners: function() {
            this.addListeners_(this.target);
        },
        addListeners_: function(node) {
            var options = this.options;
            options.attributes && node.addEventListener("DOMAttrModified", this, !0), options.characterData && node.addEventListener("DOMCharacterDataModified", this, !0), 
            options.childList && node.addEventListener("DOMNodeInserted", this, !0), (options.childList || options.subtree) && node.addEventListener("DOMNodeRemoved", this, !0);
        },
        removeListeners: function() {
            this.removeListeners_(this.target);
        },
        removeListeners_: function(node) {
            var options = this.options;
            options.attributes && node.removeEventListener("DOMAttrModified", this, !0), options.characterData && node.removeEventListener("DOMCharacterDataModified", this, !0), 
            options.childList && node.removeEventListener("DOMNodeInserted", this, !0), (options.childList || options.subtree) && node.removeEventListener("DOMNodeRemoved", this, !0);
        },
        addTransientObserver: function(node) {
            if (node !== this.target) {
                this.addListeners_(node), this.transientObservedNodes.push(node);
                var registrations = registrationsTable.get(node);
                registrations || registrationsTable.set(node, registrations = []), registrations.push(this);
            }
        },
        removeTransientObservers: function() {
            var transientObservedNodes = this.transientObservedNodes;
            this.transientObservedNodes = [], transientObservedNodes.forEach(function(node) {
                this.removeListeners_(node);
                for (var registrations = registrationsTable.get(node), i = 0; i < registrations.length; i++) if (registrations[i] === this) {
                    registrations.splice(i, 1);
                    break;
                }
            }, this);
        },
        handleEvent: function(e) {
            switch (e.stopImmediatePropagation(), e.type) {
              case "DOMAttrModified":
                var name = e.attrName, namespace = e.relatedNode.namespaceURI, target = e.target, record = new getRecord("attributes", target);
                record.attributeName = name, record.attributeNamespace = namespace;
                var oldValue = e.attrChange === MutationEvent.ADDITION ? null : e.prevValue;
                forEachAncestorAndObserverEnqueueRecord(target, function(options) {
                    return !options.attributes || options.attributeFilter && options.attributeFilter.length && -1 === options.attributeFilter.indexOf(name) && -1 === options.attributeFilter.indexOf(namespace) ? void 0 : options.attributeOldValue ? getRecordWithOldValue(oldValue) : record;
                });
                break;

              case "DOMCharacterDataModified":
                var target = e.target, record = getRecord("characterData", target), oldValue = e.prevValue;
                forEachAncestorAndObserverEnqueueRecord(target, function(options) {
                    return options.characterData ? options.characterDataOldValue ? getRecordWithOldValue(oldValue) : record : void 0;
                });
                break;

              case "DOMNodeRemoved":
                this.addTransientObserver(e.target);

              case "DOMNodeInserted":
                var addedNodes, removedNodes, target = e.relatedNode, changedNode = e.target;
                "DOMNodeInserted" === e.type ? (addedNodes = [ changedNode ], removedNodes = []) : (addedNodes = [], 
                removedNodes = [ changedNode ]);
                var previousSibling = changedNode.previousSibling, nextSibling = changedNode.nextSibling, record = getRecord("childList", target);
                record.addedNodes = addedNodes, record.removedNodes = removedNodes, record.previousSibling = previousSibling, 
                record.nextSibling = nextSibling, forEachAncestorAndObserverEnqueueRecord(target, function(options) {
                    return options.childList ? record : void 0;
                });
            }
            clearRecords();
        }
    }, global.JsMutationObserver = JsMutationObserver;
}(this), !window.MutationObserver && (window.MutationObserver = window.WebKitMutationObserver || window.JsMutationObserver, 
!MutationObserver)) throw new Error("no mutation observer support");

(function(scope) {
    function register(inName, inOptions) {
        var definition = inOptions || {};
        if (!inName) throw new Error("Name argument must not be empty");
        if (definition.name = inName, !definition.prototype) throw new Error("Options missing required prototype property");
        return definition.lifecycle = definition.lifecycle || {}, definition.ancestry = ancestry(definition.extends), 
        resolveTagName(definition), resolvePrototypeChain(definition), overrideAttributeApi(definition.prototype), 
        registerDefinition(inName, definition), definition.ctor = generateConstructor(definition), 
        definition.ctor.prototype = definition.prototype, definition.prototype.constructor = definition.ctor, 
        scope.ready && scope.upgradeAll(document), definition.ctor;
    }
    function ancestry(inExtends) {
        var extendee = registry[inExtends];
        return extendee ? ancestry(extendee.extends).concat([ extendee ]) : [];
    }
    function resolveTagName(inDefinition) {
        for (var a, baseTag = inDefinition.extends, i = 0; a = inDefinition.ancestry[i]; i++) baseTag = a.is && a.tag;
        inDefinition.tag = baseTag || inDefinition.name, baseTag && (inDefinition.is = inDefinition.name);
    }
    function resolvePrototypeChain(inDefinition) {
        if (!Object.__proto__) {
            var native = HTMLElement.prototype;
            if (inDefinition.is) {
                var inst = document.createElement(inDefinition.tag);
                native = Object.getPrototypeOf(inst);
            }
        }
        inDefinition.native = native;
    }
    function instantiate(inDefinition) {
        return upgrade(domCreateElement(inDefinition.tag), inDefinition);
    }
    function upgrade(inElement, inDefinition) {
        return inDefinition.is && inElement.setAttribute("is", inDefinition.is), implement(inElement, inDefinition), 
        inElement.__upgraded__ = !0, scope.upgradeSubtree(inElement), ready(inElement), 
        inElement;
    }
    function implement(inElement, inDefinition) {
        Object.__proto__ ? inElement.__proto__ = inDefinition.prototype : (customMixin(inElement, inDefinition.prototype, inDefinition.native), 
        inElement.__proto__ = inDefinition.prototype);
    }
    function customMixin(inTarget, inSrc, inNative) {
        for (var used = {}, p = inSrc; p !== inNative && p !== HTMLUnknownElement.prototype; ) {
            for (var k, keys = Object.getOwnPropertyNames(p), i = 0; k = keys[i]; i++) used[k] || (Object.defineProperty(inTarget, k, Object.getOwnPropertyDescriptor(p, k)), 
            used[k] = 1);
            p = Object.getPrototypeOf(p);
        }
    }
    function ready(inElement) {
        inElement.readyCallback && inElement.readyCallback();
    }
    function overrideAttributeApi(prototype) {
        var setAttribute = prototype.setAttribute;
        prototype.setAttribute = function(name, value) {
            changeAttribute.call(this, name, value, setAttribute);
        };
        var removeAttribute = prototype.removeAttribute;
        prototype.removeAttribute = function(name, value) {
            changeAttribute.call(this, name, value, removeAttribute);
        };
    }
    function changeAttribute(name, value, operation) {
        var oldValue = this.getAttribute(name);
        operation.apply(this, arguments), this.attributeChangedCallback && this.getAttribute(name) !== oldValue && this.attributeChangedCallback(name, oldValue);
    }
    function registerDefinition(inName, inDefinition) {
        registry[inName] = inDefinition;
    }
    function generateConstructor(inDefinition) {
        return function() {
            return instantiate(inDefinition);
        };
    }
    function createElement(inTag) {
        var definition = registry[inTag];
        return definition ? new definition.ctor() : domCreateElement(inTag);
    }
    function upgradeElement(inElement) {
        if (!inElement.__upgraded__ && inElement.nodeType === Node.ELEMENT_NODE) {
            var type = inElement.getAttribute("is") || inElement.localName, definition = registry[type];
            return definition && upgrade(inElement, definition);
        }
    }
    function cloneNode(deep) {
        var n = domCloneNode.call(this, deep);
        return scope.upgradeAll(n), n;
    }
    if (scope || (scope = window.CustomElements = {
        flags: {}
    }), scope.hasNative = (document.webkitRegister || document.register) && "native" === scope.flags.register, 
    scope.hasNative) {
        document.register = document.register || document.webkitRegister;
        var nop = function() {};
        scope.registry = {}, scope.upgradeElement = nop;
    } else {
        var registry = {}, domCreateElement = document.createElement.bind(document), domCloneNode = Node.prototype.cloneNode;
        document.register = register, document.createElement = createElement, Node.prototype.cloneNode = cloneNode, 
        scope.registry = registry, scope.upgrade = upgradeElement;
    }
})(window.CustomElements), function(scope) {
    function findAll(node, find, data) {
        var e = node.firstElementChild;
        if (!e) for (e = node.firstChild; e && e.nodeType !== Node.ELEMENT_NODE; ) e = e.nextSibling;
        for (;e; ) find(e, data) !== !0 && findAll(e, find, data), e = e.nextElementSibling;
        return null;
    }
    function forSubtree(node, cb) {
        findAll(node, function(e) {
            return cb(e) ? !0 : (e.webkitShadowRoot && forSubtree(e.webkitShadowRoot, cb), void 0);
        }), node.webkitShadowRoot && forSubtree(node.webkitShadowRoot, cb);
    }
    function added(node) {
        return upgrade(node) ? (insertedNode(node), !0) : (inserted(node), void 0);
    }
    function addedSubtree(node) {
        forSubtree(node, function(e) {
            return added(e) ? !0 : void 0;
        });
    }
    function addedNode(node) {
        return added(node) || addedSubtree(node);
    }
    function upgrade(node) {
        if (!node.__upgraded__ && node.nodeType === Node.ELEMENT_NODE) {
            var type = node.getAttribute("is") || node.localName, definition = scope.registry[type];
            if (definition) return logFlags.dom && console.group("upgrade:", node.localName), 
            scope.upgrade(node), logFlags.dom && console.groupEnd(), !0;
        }
    }
    function insertedNode(node) {
        inserted(node), inDocument(node) && forSubtree(node, function(e) {
            inserted(e);
        });
    }
    function inserted(element) {
        (element.insertedCallback || element.__upgraded__ && logFlags.dom) && (logFlags.dom && console.group("inserted:", element.localName), 
        inDocument(element) && (element.__inserted = (element.__inserted || 0) + 1, element.__inserted < 1 && (element.__inserted = 1), 
        element.__inserted > 1 ? logFlags.dom && console.warn("inserted:", element.localName, "insert/remove count:", element.__inserted) : element.insertedCallback && (logFlags.dom && console.log("inserted:", element.localName), 
        element.insertedCallback())), logFlags.dom && console.groupEnd());
    }
    function removedNode(node) {
        removed(node), forSubtree(node, function(e) {
            removed(e);
        });
    }
    function removed(element) {
        (element.removedCallback || element.__upgraded__ && logFlags.dom) && (logFlags.dom && console.log("removed:", element.localName), 
        inDocument(element) || (element.__inserted = (element.__inserted || 0) - 1, element.__inserted > 0 && (element.__inserted = 0), 
        element.__inserted < 0 ? logFlags.dom && console.warn("removed:", element.localName, "insert/remove count:", element.__inserted) : element.removedCallback && element.removedCallback()));
    }
    function inDocument(element) {
        for (var p = element; p; ) {
            if (p == element.ownerDocument) return !0;
            p = p.parentNode || p.host;
        }
    }
    function watchShadow(node) {
        node.webkitShadowRoot && !node.webkitShadowRoot.__watched && (logFlags.dom && console.log("watching shadow-root for: ", node.localName), 
        observe(node.webkitShadowRoot), node.webkitShadowRoot.__watched = !0);
    }
    function watchAllShadows(node) {
        watchShadow(node), forSubtree(node, function() {
            watchShadow(node);
        });
    }
    function filter(inNode) {
        switch (inNode.localName) {
          case "style":
          case "script":
          case "template":
          case void 0:
            return !0;
        }
    }
    function handler(mutations) {
        if (logFlags.dom) {
            var mx = mutations[0];
            if (mx && "childList" === mx.type && mx.addedNodes && mx.addedNodes) {
                for (var d = mx.addedNodes[0]; d && d !== document && !d.host; ) d = d.parentNode;
                var u = d && (d.URL || d._URL || d.host && d.host.localName) || "";
                u = u.split("/?").shift().split("/").pop();
            }
            console.group("mutations (%d) [%s]", mutations.length, u || "");
        }
        mutations.forEach(function(mx) {
            "childList" === mx.type && (forEach(mx.addedNodes, function(n) {
                filter(n) || addedNode(n);
            }), forEach(mx.removedNodes, function(n) {
                filter(n) || removedNode(n);
            }));
        }), logFlags.dom && console.groupEnd();
    }
    function takeRecords() {
        handler(observer.takeRecords());
    }
    function observe(inRoot) {
        observer.observe(inRoot, {
            childList: !0,
            subtree: !0
        });
    }
    function observeDocument(document) {
        observe(document);
    }
    function upgradeDocument(document) {
        logFlags.dom && console.group("upgradeDocument: ", (document.URL || document._URL || "").split("/").pop()), 
        addedNode(document), logFlags.dom && console.groupEnd();
    }
    var observer = new MutationObserver(handler), forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach);
    scope.watchShadow = watchShadow, scope.watchAllShadows = watchAllShadows, scope.upgradeAll = addedNode, 
    scope.upgradeSubtree = addedSubtree, scope.observeDocument = observeDocument, scope.upgradeDocument = upgradeDocument, 
    scope.takeRecords = takeRecords;
}(window.CustomElements), function() {
    function parseElementElement(inElement) {
        var options = {
            name: "",
            "extends": null
        };
        takeAttributes(inElement, options);
        var base = HTMLElement.prototype;
        if (options.extends) {
            var archetype = document.createElement(options.extends);
            base = archetype.__proto__ || Object.getPrototypeOf(archetype);
        }
        options.prototype = Object.create(base), inElement.options = options;
        var script = inElement.querySelector("script,scripts");
        script && executeComponentScript(script.textContent, inElement, options.name);
        var ctor = document.register(options.name, options);
        inElement.ctor = ctor;
        var refName = inElement.getAttribute("constructor");
        refName && (window[refName] = ctor);
    }
    function takeAttributes(inElement, inDictionary) {
        for (var n in inDictionary) {
            var a = inElement.attributes[n];
            a && (inDictionary[n] = a.value);
        }
    }
    function executeComponentScript(inScript, inContext, inName) {
        context = inContext;
        var owner = context.ownerDocument, url = owner._URL || owner.URL || owner.impl && (owner.impl._URL || owner.impl.URL), match = url.match(/.*\/([^.]*)[.]?.*$/);
        if (match) {
            var name = match[1];
            url += name != inName ? ":" + inName : "";
        }
        var code = "__componentScript('" + inName + "', function(){" + inScript + "});" + "\n//# sourceURL=" + url + "\n";
        eval(code);
    }
    function mixin(obj, props) {
        obj = obj || {};
        try {
            Object.getOwnPropertyNames(props).forEach(function(n) {
                var pd = Object.getOwnPropertyDescriptor(props, n);
                pd && Object.defineProperty(obj, n, pd);
            });
        } catch (x) {}
        return obj;
    }
    var HTMLElementElement = function(inElement) {
        return inElement.register = HTMLElementElement.prototype.register, parseElementElement(inElement), 
        inElement;
    };
    HTMLElementElement.prototype = {
        register: function(inMore) {
            inMore && (this.options.lifecycle = inMore.lifecycle, inMore.prototype && mixin(this.options.prototype, inMore.prototype));
        }
    };
    var context;
    window.__componentScript = function(inName, inFunc) {
        inFunc.call(context);
    }, window.HTMLElementElement = HTMLElementElement;
}(), function() {
    function isDocumentLink(inElt) {
        return "link" === inElt.localName && inElt.getAttribute("rel") === IMPORT_LINK_TYPE;
    }
    var IMPORT_LINK_TYPE = window.HTMLImports ? HTMLImports.IMPORT_LINK_TYPE : "none", parser = {
        selectors: [ "link[rel=" + IMPORT_LINK_TYPE + "]", "element" ],
        map: {
            link: "parseLink",
            element: "parseElement"
        },
        parse: function(inDocument) {
            if (!inDocument.__parsed) {
                inDocument.__parsed = !0;
                var elts = inDocument.querySelectorAll(parser.selectors);
                forEach(elts, function(e) {
                    parser[parser.map[e.localName]](e);
                }), CustomElements.upgradeDocument(inDocument), CustomElements.observeDocument(inDocument);
            }
        },
        parseLink: function(linkElt) {
            isDocumentLink(linkElt) && this.parseImport(linkElt);
        },
        parseImport: function(linkElt) {
            linkElt.content && parser.parse(linkElt.content);
        },
        parseElement: function(inElementElt) {
            new HTMLElementElement(inElementElt);
        }
    }, forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach);
    CustomElements.parser = parser;
}(), function() {
    function bootstrap() {
        setTimeout(function() {
            CustomElements.parser.parse(document), CustomElements.upgradeDocument(document), 
            CustomElements.ready = !0, CustomElements.readyTime = new Date().getTime(), window.HTMLImports && (CustomElements.elapsed = CustomElements.readyTime - HTMLImports.readyTime), 
            document.body.dispatchEvent(new CustomEvent("WebComponentsReady", {
                bubbles: !0
            }));
        }, 0);
    }
    if ("function" != typeof window.CustomEvent && (window.CustomEvent = function(inType) {
        var e = document.createEvent("HTMLEvents");
        return e.initEvent(inType, !0, !0), e;
    }), "complete" === document.readyState) bootstrap(); else {
        var loadEvent = window.HTMLImports ? "HTMLImportsLoaded" : "DOMContentLoaded";
        window.addEventListener(loadEvent, bootstrap);
    }
}(), function() {
    function nop() {}
    var style = document.createElement("style");
    style.textContent = "element {display: none;} /* injected by platform.js */";
    var head = document.querySelector("head");
    if (head.insertBefore(style, head.firstChild), window.ShadowDOMPolyfill) {
        CustomElements.watchShadow = nop, CustomElements.watchAllShadows = nop;
        var fns = [ "upgradeAll", "upgradeSubtree", "observeDocument", "upgradeDocument" ], original = {};
        fns.forEach(function(fn) {
            original[fn] = CustomElements[fn];
        }), fns.forEach(function(fn) {
            CustomElements[fn] = function(inNode) {
                return original[fn](wrap(inNode));
            };
        });
    }
}(), function(scope) {
    scope = scope || {};
    var target = {
        shadow: function(inEl) {
            return inEl ? inEl.shadowRoot || inEl.webkitShadowRoot : void 0;
        },
        canTarget: function(scope) {
            return scope && Boolean(scope.elementFromPoint);
        },
        targetingShadow: function(inEl) {
            var s = this.shadow(inEl);
            return this.canTarget(s) ? s : void 0;
        },
        searchRoot: function(inRoot, x, y) {
            if (inRoot) {
                var st, sr, os, t = inRoot.elementFromPoint(x, y);
                for (sr = this.targetingShadow(t); sr; ) {
                    if (st = sr.elementFromPoint(x, y)) {
                        var ssr = this.targetingShadow(st);
                        return this.searchRoot(ssr, x, y) || st;
                    }
                    os = sr.querySelector("shadow"), sr = os && os.olderShadowRoot;
                }
                return t;
            }
        },
        findTarget: function(inEvent) {
            var x = inEvent.clientX, y = inEvent.clientY;
            return this.searchRoot(document, x, y);
        }
    };
    scope.targetFinding = target, scope.findTarget = target.findTarget.bind(target), 
    window.PointerEventsPolyfill = scope;
}(window.PointerEventsPolyfill), function() {
    function selector(v) {
        return '[touch-action="' + v + '"]';
    }
    function rule(v) {
        return "{ -ms-touch-action: " + v + "; touch-action: " + v + "; }";
    }
    var attrib2css = [ "none", "pan-x", "pan-y", {
        rule: "pan-x pan-y",
        selectors: [ "scroll", "pan-x pan-y", "pan-y pan-x" ]
    } ], styles = "";
    attrib2css.forEach(function(r) {
        styles += String(r) === r ? selector(r) + rule(r) : r.selectors.map(selector) + rule(r.rule);
    });
    var el = document.createElement("style");
    el.textContent = styles;
    var h = document.querySelector("head");
    h.insertBefore(el, h.firstChild);
}(), function(scope) {
    function PointerEvent(inType, inDict) {
        var inDict = inDict || {}, buttons = inDict.buttons;
        if (void 0 === buttons) switch (inDict.which) {
          case 1:
            buttons = 1;
            break;

          case 2:
            buttons = 4;
            break;

          case 3:
            buttons = 2;
            break;

          default:
            buttons = 0;
        }
        var e;
        if (NEW_MOUSE_EVENT) e = new MouseEvent(inType, inDict); else {
            e = document.createEvent("MouseEvent");
            var props = {
                bubbles: !1,
                cancelable: !1,
                view: null,
                detail: null,
                screenX: 0,
                screenY: 0,
                clientX: 0,
                clientY: 0,
                ctrlKey: !1,
                altKey: !1,
                shiftKey: !1,
                metaKey: !1,
                button: 0,
                relatedTarget: null
            };
            Object.keys(props).forEach(function(k) {
                k in inDict && (props[k] = inDict[k]);
            }), e.initMouseEvent(inType, props.bubbles, props.cancelable, props.view, props.detail, props.screenX, props.screenY, props.clientX, props.clientY, props.ctrlKey, props.altKey, props.shiftKey, props.metaKey, props.button, props.relatedTarget);
        }
        HAS_BUTTONS || Object.defineProperty(e, "buttons", {
            get: function() {
                return buttons;
            },
            enumerable: !0
        });
        var pressure = 0;
        return pressure = inDict.pressure ? inDict.pressure : buttons ? .5 : 0, Object.defineProperties(e, {
            pointerId: {
                value: inDict.pointerId || 0,
                enumerable: !0
            },
            width: {
                value: inDict.width || 0,
                enumerable: !0
            },
            height: {
                value: inDict.height || 0,
                enumerable: !0
            },
            pressure: {
                value: pressure,
                enumerable: !0
            },
            tiltX: {
                value: inDict.tiltX || 0,
                enumerable: !0
            },
            tiltY: {
                value: inDict.tiltY || 0,
                enumerable: !0
            },
            pointerType: {
                value: inDict.pointerType || "",
                enumerable: !0
            },
            hwTimestamp: {
                value: inDict.hwTimestamp || 0,
                enumerable: !0
            },
            isPrimary: {
                value: inDict.isPrimary || !1,
                enumerable: !0
            }
        }), e;
    }
    var NEW_MOUSE_EVENT = !1, HAS_BUTTONS = !1;
    try {
        var ev = new MouseEvent("click", {
            buttons: 1
        });
        NEW_MOUSE_EVENT = !0, HAS_BUTTONS = 1 === ev.buttons;
    } catch (e) {}
    scope.PointerEvent = PointerEvent;
}(window), function(scope) {
    function PointerMap() {
        this.ids = [], this.pointers = [];
    }
    PointerMap.prototype = {
        set: function(inId, inEvent) {
            var i = this.ids.indexOf(inId);
            i > -1 ? this.pointers[i] = inEvent : (this.ids.push(inId), this.pointers.push(inEvent));
        },
        has: function(inId) {
            return this.ids.indexOf(inId) > -1;
        },
        "delete": function(inId) {
            var i = this.ids.indexOf(inId);
            i > -1 && (this.ids.splice(i, 1), this.pointers.splice(i, 1));
        },
        get: function(inId) {
            var i = this.ids.indexOf(inId);
            return this.pointers[i];
        },
        get size() {
            return this.pointers.length;
        },
        clear: function() {
            this.ids.length = 0, this.pointers.length = 0;
        }
    }, scope.PointerMap = PointerMap;
}(window.PointerEventsPolyfill), function(scope) {
    var SideTable;
    if ("undefined" != typeof WeakMap && navigator.userAgent.indexOf("Firefox/") < 0) SideTable = WeakMap; else {
        var defineProperty = Object.defineProperty, hasOwnProperty = Object.hasOwnProperty, counter = new Date().getTime() % 1e9;
        SideTable = function() {
            this.name = "__st" + (1e9 * Math.random() >>> 0) + (counter++ + "__");
        }, SideTable.prototype = {
            set: function(key, value) {
                defineProperty(key, this.name, {
                    value: value,
                    writable: !0
                });
            },
            get: function(key) {
                return hasOwnProperty.call(key, this.name) ? key[this.name] : void 0;
            },
            "delete": function(key) {
                this.set(key, void 0);
            }
        };
    }
    scope.SideTable = SideTable;
}(window.PointerEventsPolyfill), function(scope) {
    var dispatcher = {
        targets: new scope.SideTable(),
        handledEvents: new scope.SideTable(),
        scrollType: new scope.SideTable(),
        pointermap: new scope.PointerMap(),
        events: [],
        eventMap: {},
        eventSources: {},
        registerSource: function(inName, inSource) {
            var s = inSource, newEvents = s.events;
            newEvents && (this.events = this.events.concat(newEvents), newEvents.forEach(function(e) {
                s[e] && (this.eventMap[e] = s[e].bind(s));
            }, this), this.eventSources[inName] = s);
        },
        registerTarget: function(inTarget, inAxis) {
            this.scrollType.set(inTarget, inAxis || "none"), this.listen(this.events, inTarget, this.boundHandler);
        },
        unregisterTarget: function(inTarget) {
            this.scrollType.set(inTarget, null), this.unlisten(this.events, inTarget, this.boundHandler);
        },
        down: function(inEvent) {
            this.fireEvent("pointerdown", inEvent);
        },
        move: function(inEvent) {
            this.fireEvent("pointermove", inEvent);
        },
        up: function(inEvent) {
            this.fireEvent("pointerup", inEvent);
        },
        enter: function(inEvent) {
            inEvent.bubbles = !1, this.fireEvent("pointerenter", inEvent);
        },
        leave: function(inEvent) {
            inEvent.bubbles = !1, this.fireEvent("pointerleave", inEvent);
        },
        over: function(inEvent) {
            inEvent.bubbles = !0, this.fireEvent("pointerover", inEvent);
        },
        out: function(inEvent) {
            inEvent.bubbles = !0, this.fireEvent("pointerout", inEvent);
        },
        cancel: function(inEvent) {
            this.fireEvent("pointercancel", inEvent);
        },
        leaveOut: function(event) {
            event.target.contains(event.relatedTarget) || this.leave(event), this.out(event);
        },
        enterOver: function(event) {
            event.target.contains(event.relatedTarget) || this.enter(event), this.over(event);
        },
        eventHandler: function(inEvent) {
            if (!this.handledEvents.get(inEvent)) {
                var type = inEvent.type, fn = this.eventMap && this.eventMap[type];
                fn && fn(inEvent), this.handledEvents.set(inEvent, !0);
            }
        },
        listen: function(inEvents, inTarget, inListener) {
            inEvents.forEach(function(e) {
                this.addEvent(e, inListener, !1, inTarget);
            }, this);
        },
        unlisten: function(inEvents, inTarget, inListener) {
            inEvents.forEach(function(e) {
                this.removeEvent(e, inListener, !1, inTarget);
            }, this);
        },
        addEvent: function(inEventName, inEventHandler, inCapture, inTarget) {
            inTarget.addEventListener(inEventName, inEventHandler, inCapture);
        },
        removeEvent: function(inEventName, inEventHandler, inCapture, inTarget) {
            inTarget.removeEventListener(inEventName, inEventHandler, inCapture);
        },
        makeEvent: function(inType, inEvent) {
            var e = new PointerEvent(inType, inEvent);
            return this.targets.set(e, this.targets.get(inEvent) || inEvent.target), e;
        },
        fireEvent: function(inType, inEvent) {
            var e = this.makeEvent(inType, inEvent);
            return this.dispatchEvent(e);
        },
        cloneEvent: function(inEvent) {
            var eventCopy = {};
            for (var n in inEvent) eventCopy[n] = inEvent[n];
            return eventCopy;
        },
        getTarget: function(inEvent) {
            return this.captureInfo && this.captureInfo.id === inEvent.pointerId ? this.captureInfo.target : this.targets.get(inEvent);
        },
        setCapture: function(inPointerId, inTarget) {
            this.captureInfo && this.releaseCapture(this.captureInfo.id), this.captureInfo = {
                id: inPointerId,
                target: inTarget
            };
            var e = new PointerEvent("gotpointercapture", {
                bubbles: !0
            });
            this.implicitRelease = this.releaseCapture.bind(this, inPointerId), document.addEventListener("pointerup", this.implicitRelease), 
            document.addEventListener("pointercancel", this.implicitRelease), this.targets.set(e, inTarget), 
            this.asyncDispatchEvent(e);
        },
        releaseCapture: function(inPointerId) {
            if (this.captureInfo && this.captureInfo.id === inPointerId) {
                var e = new PointerEvent("lostpointercapture", {
                    bubbles: !0
                }), t = this.captureInfo.target;
                this.captureInfo = null, document.removeEventListener("pointerup", this.implicitRelease), 
                document.removeEventListener("pointercancel", this.implicitRelease), this.targets.set(e, t), 
                this.asyncDispatchEvent(e);
            }
        },
        dispatchEvent: function(inEvent) {
            var t = this.getTarget(inEvent);
            return t ? t.dispatchEvent(inEvent) : void 0;
        },
        asyncDispatchEvent: function(inEvent) {
            setTimeout(this.dispatchEvent.bind(this, inEvent), 0);
        }
    };
    dispatcher.boundHandler = dispatcher.eventHandler.bind(dispatcher), scope.dispatcher = dispatcher;
}(window.PointerEventsPolyfill), function(scope) {
    var dispatcher = scope.dispatcher, forEach = Array.prototype.forEach.call.bind(Array.prototype.forEach), map = Array.prototype.map.call.bind(Array.prototype.map), installer = {
        ATTRIB: "touch-action",
        SELECTOR: "[touch-action]",
        EMITTER: "none",
        XSCROLLER: "pan-x",
        YSCROLLER: "pan-y",
        SCROLLER: /^(?:pan-x pan-y)|(?:pan-y pan-x)|scroll$/,
        OBSERVER_INIT: {
            subtree: !0,
            childList: !0,
            attributes: !0,
            attributeFilter: [ "touch-action" ]
        },
        watchSubtree: function(inScope) {
            scope.targetFinding.canTarget(inScope) && observer.observe(inScope, this.OBSERVER_INIT);
        },
        enableOnSubtree: function(inScope) {
            var scope = inScope || document;
            this.watchSubtree(inScope), scope === document && "complete" !== document.readyState ? this.installOnLoad() : this.installNewSubtree(scope);
        },
        installNewSubtree: function(inScope) {
            forEach(this.findElements(inScope), this.addElement, this);
        },
        findElements: function(inScope) {
            var scope = inScope || document;
            return scope.querySelectorAll ? scope.querySelectorAll(this.SELECTOR) : [];
        },
        touchActionToScrollType: function(inTouchAction) {
            var t = inTouchAction;
            return t === this.EMITTER ? "none" : t === this.XSCROLLER ? "X" : t === this.YSCROLLER ? "Y" : this.SCROLLER.exec(t) ? "XY" : void 0;
        },
        removeElement: function(inEl) {
            dispatcher.unregisterTarget(inEl);
            var s = scope.targetFinding.shadow(inEl);
            s && dispatcher.unregisterTarget(s);
        },
        addElement: function(inEl) {
            var a = inEl.getAttribute && inEl.getAttribute(this.ATTRIB), st = this.touchActionToScrollType(a);
            if (st) {
                dispatcher.registerTarget(inEl, st);
                var s = scope.targetFinding.shadow(inEl);
                s && dispatcher.registerTarget(s, st);
            }
        },
        elementChanged: function(inEl) {
            this.removeElement(inEl), this.addElement(inEl);
        },
        concatLists: function(inAccum, inList) {
            for (var o, i = 0, l = inList.length; l > i && (o = inList[i]); i++) inAccum.push(o);
            return inAccum;
        },
        installOnLoad: function() {
            document.addEventListener("DOMContentLoaded", this.installNewSubtree.bind(this, document));
        },
        flattenMutationTree: function(inNodes) {
            var tree = map(inNodes, this.findElements, this);
            return tree.push(inNodes), tree.reduce(this.concatLists, []);
        },
        mutationWatcher: function(inMutations) {
            inMutations.forEach(this.mutationHandler, this);
        },
        mutationHandler: function(inMutation) {
            var m = inMutation;
            if ("childList" === m.type) {
                var added = this.flattenMutationTree(m.addedNodes);
                added.forEach(this.addElement, this);
                var removed = this.flattenMutationTree(m.removedNodes);
                removed.forEach(this.removeElement, this);
            } else "attributes" === m.type && this.elementChanged(m.target);
        }
    }, boundWatcher = installer.mutationWatcher.bind(installer);
    scope.installer = installer, scope.register = installer.enableOnSubtree.bind(installer), 
    scope.setTouchAction = function(inEl, inTouchAction) {
        var st = this.touchActionToScrollType(inTouchAction);
        st ? dispatcher.registerTarget(inEl, st) : dispatcher.unregisterTarget(inEl);
    }.bind(installer);
    var MO = window.MutationObserver || window.WebKitMutationObserver;
    if (MO) var observer = new MO(boundWatcher); else installer.watchSubtree = function() {
        console.warn("PointerEventsPolyfill: MutationObservers not found, touch-action will not be dynamically detected");
    };
}(window.PointerEventsPolyfill), function(scope) {
    var dispatcher = scope.dispatcher, pointermap = dispatcher.pointermap, DEDUP_DIST = 25, mouseEvents = {
        POINTER_ID: 1,
        POINTER_TYPE: "mouse",
        events: [ "mousedown", "mousemove", "mouseup", "mouseover", "mouseout" ],
        global: [ "mousedown", "mouseup", "mouseover", "mouseout" ],
        lastTouches: [],
        mouseHandler: dispatcher.eventHandler.bind(dispatcher),
        isEventSimulatedFromTouch: function(inEvent) {
            for (var t, lts = this.lastTouches, x = inEvent.clientX, y = inEvent.clientY, i = 0, l = lts.length; l > i && (t = lts[i]); i++) {
                var dx = Math.abs(x - t.x), dy = Math.abs(y - t.y);
                if (DEDUP_DIST >= dx && DEDUP_DIST >= dy) return !0;
            }
        },
        prepareEvent: function(inEvent) {
            var e = dispatcher.cloneEvent(inEvent);
            return e.pointerId = this.POINTER_ID, e.isPrimary = !0, e.pointerType = this.POINTER_TYPE, 
            e;
        },
        mousedown: function(inEvent) {
            if (!this.isEventSimulatedFromTouch(inEvent)) {
                var p = pointermap.has(this.POINTER_ID);
                if (p && (this.cancel(inEvent), p = !1), !p) {
                    var e = this.prepareEvent(inEvent);
                    pointermap.set(this.POINTER_ID, inEvent), dispatcher.down(e), dispatcher.listen(this.global, document, this.mouseHandler);
                }
            }
        },
        mousemove: function(inEvent) {
            if (!this.isEventSimulatedFromTouch(inEvent)) {
                var e = this.prepareEvent(inEvent);
                dispatcher.move(e);
            }
        },
        mouseup: function(inEvent) {
            if (!this.isEventSimulatedFromTouch(inEvent)) {
                var p = pointermap.get(this.POINTER_ID);
                if (p && p.button === inEvent.button) {
                    var e = this.prepareEvent(inEvent);
                    dispatcher.up(e), this.cleanupMouse();
                }
            }
        },
        mouseover: function(inEvent) {
            if (!this.isEventSimulatedFromTouch(inEvent)) {
                var e = this.prepareEvent(inEvent);
                dispatcher.enterOver(e);
            }
        },
        mouseout: function(inEvent) {
            if (!this.isEventSimulatedFromTouch(inEvent)) {
                var e = this.prepareEvent(inEvent);
                dispatcher.leaveOut(e);
            }
        },
        cancel: function(inEvent) {
            var e = this.prepareEvent(inEvent);
            dispatcher.cancel(e), this.cleanupMouse();
        },
        cleanupMouse: function() {
            pointermap.delete(this.POINTER_ID), dispatcher.unlisten(this.global, document, this.mouseHandler);
        }
    };
    dispatcher.listen([ "mousemove" ], document, dispatcher.boundHandler), scope.mouseEvents = mouseEvents;
}(window.PointerEventsPolyfill), function(scope) {
    var dispatcher = scope.dispatcher, findTarget = scope.findTarget, pointermap = dispatcher.pointermap, scrollType = dispatcher.scrollType, touchMap = Array.prototype.map.call.bind(Array.prototype.map), DEDUP_TIMEOUT = 2500, touchEvents = {
        events: [ "touchstart", "touchmove", "touchend", "touchcancel" ],
        POINTER_TYPE: "touch",
        firstTouch: null,
        isPrimaryTouch: function(inTouch) {
            return this.firstTouch === inTouch.identifier;
        },
        setPrimaryTouch: function(inTouch) {
            null === this.firstTouch && (this.firstTouch = inTouch.identifier, this.firstXY = {
                X: inTouch.clientX,
                Y: inTouch.clientY
            }, this.scrolling = !1);
        },
        removePrimaryTouch: function(inTouch) {
            this.isPrimaryTouch(inTouch) && (this.firstTouch = null, this.firstXY = null);
        },
        touchToPointer: function(inTouch) {
            var e = dispatcher.cloneEvent(inTouch);
            return e.pointerId = inTouch.identifier + 2, e.target = findTarget(e), e.bubbles = !0, 
            e.cancelable = !0, e.button = 0, e.buttons = 1, e.width = inTouch.webkitRadiusX || inTouch.radiusX, 
            e.height = inTouch.webkitRadiusY || inTouch.radiusY, e.pressure = inTouch.webkitForce || inTouch.force, 
            e.isPrimary = this.isPrimaryTouch(inTouch), e.pointerType = this.POINTER_TYPE, e;
        },
        processTouches: function(inEvent, inFunction) {
            var tl = inEvent.changedTouches, pointers = touchMap(tl, this.touchToPointer, this);
            pointers.forEach(inFunction, this);
        },
        shouldScroll: function(inEvent) {
            if (this.firstXY) {
                var ret, scrollAxis = scrollType.get(inEvent.currentTarget);
                if ("none" === scrollAxis) ret = !1; else if ("XY" === scrollAxis) ret = !0; else {
                    var t = inEvent.changedTouches[0], a = scrollAxis, oa = "Y" === scrollAxis ? "X" : "Y", da = Math.abs(t["client" + a] - this.firstXY[a]), doa = Math.abs(t["client" + oa] - this.firstXY[oa]);
                    ret = da >= doa;
                }
                return this.firstXY = null, ret;
            }
        },
        findTouch: function(inTL, inId) {
            for (var t, i = 0, l = inTL.length; l > i && (t = inTL[i]); i++) if (t.identifier === inId) return !0;
        },
        vacuumTouches: function(inEvent) {
            var tl = inEvent.touches;
            if (pointermap.size >= tl.length) {
                var d = [];
                pointermap.ids.forEach(function(i) {
                    if (1 !== i && !this.findTouch(tl, i - 2)) {
                        var p = pointermap.get(i).out;
                        d.push(this.touchToPointer(p));
                    }
                }, this), d.forEach(this.cancelOut, this);
            }
        },
        touchstart: function(inEvent) {
            this.vacuumTouches(inEvent), this.setPrimaryTouch(inEvent.changedTouches[0]), this.dedupSynthMouse(inEvent), 
            this.scrolling || this.processTouches(inEvent, this.overDown);
        },
        overDown: function(inPointer) {
            pointermap.set(inPointer.pointerId, {
                target: inPointer.target,
                out: inPointer,
                outTarget: inPointer.target
            }), dispatcher.over(inPointer), dispatcher.down(inPointer);
        },
        touchmove: function(inEvent) {
            this.scrolling || (this.shouldScroll(inEvent) ? (this.scrolling = !0, this.touchcancel(inEvent)) : (inEvent.preventDefault(), 
            this.processTouches(inEvent, this.moveOverOut)));
        },
        moveOverOut: function(inPointer) {
            var event = inPointer, pointer = pointermap.get(event.pointerId);
            if (pointer) {
                var outEvent = pointer.out, outTarget = pointer.outTarget;
                dispatcher.move(event), outEvent && outTarget !== event.target && (outEvent.relatedTarget = event.target, 
                event.relatedTarget = outTarget, outEvent.target = outTarget, event.target ? (dispatcher.leaveOut(outEvent), 
                dispatcher.enterOver(event)) : (event.target = outTarget, event.relatedTarget = null, 
                this.cancelOut(event))), pointer.out = event, pointer.outTarget = event.target;
            }
        },
        touchend: function(inEvent) {
            this.dedupSynthMouse(inEvent), this.processTouches(inEvent, this.upOut);
        },
        upOut: function(inPointer) {
            this.scrolling || (dispatcher.up(inPointer), dispatcher.out(inPointer)), this.cleanUpPointer(inPointer);
        },
        touchcancel: function(inEvent) {
            this.processTouches(inEvent, this.cancelOut);
        },
        cancelOut: function(inPointer) {
            dispatcher.cancel(inPointer), dispatcher.out(inPointer), this.cleanUpPointer(inPointer);
        },
        cleanUpPointer: function(inPointer) {
            pointermap.delete(inPointer.pointerId), this.removePrimaryTouch(inPointer);
        },
        dedupSynthMouse: function(inEvent) {
            var lts = scope.mouseEvents.lastTouches, t = inEvent.changedTouches[0];
            if (this.isPrimaryTouch(t)) {
                var lt = {
                    x: t.clientX,
                    y: t.clientY
                };
                lts.push(lt);
                var fn = function(lts, lt) {
                    var i = lts.indexOf(lt);
                    i > -1 && lts.splice(i, 1);
                }.bind(null, lts, lt);
                setTimeout(fn, DEDUP_TIMEOUT);
            }
        }
    };
    scope.touchEvents = touchEvents;
}(window.PointerEventsPolyfill), function(scope) {
    var dispatcher = scope.dispatcher, pointermap = dispatcher.pointermap, msEvents = {
        events: [ "MSPointerDown", "MSPointerMove", "MSPointerUp", "MSPointerOut", "MSPointerOver", "MSPointerCancel", "MSGotPointerCapture", "MSLostPointerCapture" ],
        POINTER_TYPES: [ "", "unavailable", "touch", "pen", "mouse" ],
        prepareEvent: function(inEvent) {
            var e = dispatcher.cloneEvent(inEvent);
            return e.pointerType = this.POINTER_TYPES[inEvent.pointerType], e;
        },
        cleanup: function(id) {
            pointermap.delete(id);
        },
        MSPointerDown: function(inEvent) {
            pointermap.set(inEvent.pointerId, inEvent);
            var e = this.prepareEvent(inEvent);
            dispatcher.down(e);
        },
        MSPointerMove: function(inEvent) {
            var e = this.prepareEvent(inEvent);
            dispatcher.move(e);
        },
        MSPointerUp: function(inEvent) {
            var e = this.prepareEvent(inEvent);
            dispatcher.up(e), this.cleanup(inEvent.pointerId);
        },
        MSPointerOut: function(inEvent) {
            var e = this.prepareEvent(inEvent);
            dispatcher.leaveOut(e);
        },
        MSPointerOver: function(inEvent) {
            var e = this.prepareEvent(inEvent);
            dispatcher.enterOver(e);
        },
        MSPointerCancel: function(inEvent) {
            var e = this.prepareEvent(inEvent);
            dispatcher.cancel(e), this.cleanup(inEvent.pointerId);
        },
        MSLostPointerCapture: function(inEvent) {
            var e = dispatcher.makeEvent("lostpointercapture", inEvent);
            dispatcher.dispatchEvent(e);
        },
        MSGotPointerCapture: function(inEvent) {
            var e = dispatcher.makeEvent("gotpointercapture", inEvent);
            dispatcher.dispatchEvent(e);
        }
    };
    scope.msEvents = msEvents;
}(window.PointerEventsPolyfill), function(scope) {
    var dispatcher = scope.dispatcher, installer = scope.installer;
    if (void 0 === window.navigator.pointerEnabled) {
        if (window.navigator.msPointerEnabled) {
            var tp = window.navigator.msMaxTouchPoints;
            Object.defineProperty(window.navigator, "maxTouchPoints", {
                value: tp,
                enumerable: !0
            }), dispatcher.registerSource("ms", scope.msEvents), dispatcher.registerTarget(document);
        } else dispatcher.registerSource("mouse", scope.mouseEvents), void 0 !== window.ontouchstart && dispatcher.registerSource("touch", scope.touchEvents), 
        installer.enableOnSubtree(document);
        Object.defineProperty(window.navigator, "pointerEnabled", {
            value: !0,
            enumerable: !0
        });
    }
}(window.PointerEventsPolyfill), function(scope) {
    function assertDown(id) {
        if (!dispatcher.pointermap.has(id)) throw new Error("InvalidPointerId");
    }
    var s, r, dispatcher = scope.dispatcher, n = window.navigator;
    n.msPointerEnabled ? (s = function(pointerId) {
        assertDown(pointerId), this.msSetPointerCapture(pointerId);
    }, r = function(pointerId) {
        assertDown(pointerId), this.msReleasePointerCapture(pointerId);
    }) : (s = function(pointerId) {
        assertDown(pointerId), dispatcher.setCapture(pointerId, this);
    }, r = function(pointerId) {
        assertDown(pointerId), dispatcher.releaseCapture(pointerId, this);
    }), Element.prototype.setPointerCapture || Object.defineProperties(Element.prototype, {
        setPointerCapture: {
            value: s
        },
        releasePointerCapture: {
            value: r
        }
    });
}(window.PointerEventsPolyfill), PointerGestureEvent.prototype.preventTap = function() {
    this.tapPrevented = !0;
}, function(scope) {
    scope = scope || {}, scope.utils = {
        LCA: {
            find: function(a, b) {
                if (a === b) return a;
                if (a.contains) {
                    if (a.contains(b)) return a;
                    if (b.contains(a)) return b;
                }
                var adepth = this.depth(a), bdepth = this.depth(b), d = adepth - bdepth;
                for (d > 0 ? a = this.walk(a, d) : b = this.walk(b, -d); a && b && a !== b; ) a = this.walk(a, 1), 
                b = this.walk(b, 1);
                return a;
            },
            walk: function(n, u) {
                for (var i = 0; u > i; i++) n = n.parentNode;
                return n;
            },
            depth: function(n) {
                for (var d = 0; n; ) d++, n = n.parentNode;
                return d;
            }
        }
    }, scope.findLCA = function(a, b) {
        return scope.utils.LCA.find(a, b);
    }, window.PointerGestures = scope;
}(window.PointerGestures), function(scope) {
    var SideTable;
    if ("undefined" != typeof WeakMap && navigator.userAgent.indexOf("Firefox/") < 0) SideTable = WeakMap; else {
        var defineProperty = Object.defineProperty, hasOwnProperty = Object.hasOwnProperty, counter = new Date().getTime() % 1e9;
        SideTable = function() {
            this.name = "__st" + (1e9 * Math.random() >>> 0) + (counter++ + "__");
        }, SideTable.prototype = {
            set: function(key, value) {
                defineProperty(key, this.name, {
                    value: value,
                    writable: !0
                });
            },
            get: function(key) {
                return hasOwnProperty.call(key, this.name) ? key[this.name] : void 0;
            },
            "delete": function(key) {
                this.set(key, void 0);
            }
        };
    }
    scope.SideTable = SideTable;
}(window.PointerGestures), function(scope) {
    function PointerMap() {
        this.ids = [], this.pointers = [];
    }
    PointerMap.prototype = {
        set: function(inId, inEvent) {
            var i = this.ids.indexOf(inId);
            i > -1 ? this.pointers[i] = inEvent : (this.ids.push(inId), this.pointers.push(inEvent));
        },
        has: function(inId) {
            return this.ids.indexOf(inId) > -1;
        },
        "delete": function(inId) {
            var i = this.ids.indexOf(inId);
            i > -1 && (this.ids.splice(i, 1), this.pointers.splice(i, 1));
        },
        get: function(inId) {
            var i = this.ids.indexOf(inId);
            return this.pointers[i];
        },
        get size() {
            return this.pointers.length;
        },
        clear: function() {
            this.ids.length = 0, this.pointers.length = 0;
        }
    }, window.Map && (PointerMap = window.Map), scope.PointerMap = PointerMap;
}(window.PointerGestures), function(scope) {
    var dispatcher = {
        handledEvents: new scope.SideTable(),
        targets: new scope.SideTable(),
        handlers: {},
        recognizers: {},
        events: [ "pointerdown", "pointermove", "pointerup", "pointerover", "pointerout", "pointercancel" ],
        registerRecognizer: function(inName, inRecognizer) {
            var r = inRecognizer;
            this.recognizers[inName] = r, this.events.forEach(function(e) {
                if (r[e]) {
                    var f = r[e].bind(r);
                    this.addHandler(e, f);
                }
            }, this);
        },
        addHandler: function(inEvent, inFn) {
            var e = inEvent;
            this.handlers[e] || (this.handlers[e] = []), this.handlers[e].push(inFn);
        },
        registerTarget: function(inTarget) {
            this.listen(this.events, inTarget);
        },
        unregisterTarget: function(inTarget) {
            this.unlisten(this.events, inTarget);
        },
        eventHandler: function(inEvent) {
            if (!this.handledEvents.get(inEvent)) {
                var fns, type = inEvent.type;
                (fns = this.handlers[type]) && this.makeQueue(fns, inEvent), this.handledEvents.set(inEvent, !0);
            }
        },
        makeQueue: function(inHandlerFns, inEvent) {
            var e = this.cloneEvent(inEvent);
            setTimeout(this.runQueue.bind(this, inHandlerFns, e), 0);
        },
        runQueue: function(inHandlers, inEvent) {
            this.currentPointerId = inEvent.pointerId;
            for (var f, i = 0, l = inHandlers.length; l > i && (f = inHandlers[i]); i++) f(inEvent);
            this.currentPointerId = 0;
        },
        listen: function(inEvents, inTarget) {
            inEvents.forEach(function(e) {
                this.addEvent(e, this.boundHandler, !1, inTarget);
            }, this);
        },
        unlisten: function(inEvents) {
            inEvents.forEach(function(e) {
                this.removeEvent(e, this.boundHandler, !1, inTarget);
            }, this);
        },
        addEvent: function(inEventName, inEventHandler, inCapture, inTarget) {
            inTarget.addEventListener(inEventName, inEventHandler, inCapture);
        },
        removeEvent: function(inEventName, inEventHandler, inCapture, inTarget) {
            inTarget.removeEventListener(inEventName, inEventHandler, inCapture);
        },
        makeEvent: function(inType, inDict) {
            return new PointerGestureEvent(inType, inDict);
        },
        cloneEvent: function(inEvent) {
            var eventCopy = {};
            for (var n in inEvent) eventCopy[n] = inEvent[n];
            return eventCopy;
        },
        dispatchEvent: function(inEvent, inTarget) {
            var t = inTarget || this.targets.get(inEvent);
            t && (t.dispatchEvent(inEvent), inEvent.tapPrevented && this.preventTap(this.currentPointerId));
        },
        asyncDispatchEvent: function(inEvent, inTarget) {
            var fn = function() {
                this.dispatchEvent(inEvent, inTarget);
            }.bind(this);
            setTimeout(fn, 0);
        },
        preventTap: function(inPointerId) {
            var t = this.recognizers.tap;
            t && t.preventTap(inPointerId);
        }
    };
    dispatcher.boundHandler = dispatcher.eventHandler.bind(dispatcher), scope.dispatcher = dispatcher, 
    scope.register = function(inScope) {
        var pe = window.PointerEventsPolyfill;
        pe && pe.register(inScope), scope.dispatcher.registerTarget(inScope);
    }, dispatcher.registerTarget(document);
}(window.PointerGestures), function(scope) {
    var dispatcher = scope.dispatcher, hold = {
        HOLD_DELAY: 200,
        WIGGLE_THRESHOLD: 16,
        events: [ "pointerdown", "pointermove", "pointerup", "pointercancel" ],
        heldPointer: null,
        holdJob: null,
        pulse: function() {
            var hold = Date.now() - this.heldPointer.timeStamp, type = this.held ? "holdpulse" : "hold";
            this.fireHold(type, hold), this.held = !0;
        },
        cancel: function() {
            clearInterval(this.holdJob), this.held && this.fireHold("release"), this.held = !1, 
            this.heldPointer = null, this.target = null, this.holdJob = null;
        },
        pointerdown: function(inEvent) {
            inEvent.isPrimary && !this.heldPointer && (this.heldPointer = inEvent, this.target = inEvent.target, 
            this.holdJob = setInterval(this.pulse.bind(this), this.HOLD_DELAY));
        },
        pointerup: function(inEvent) {
            this.heldPointer && this.heldPointer.pointerId === inEvent.pointerId && this.cancel();
        },
        pointercancel: function() {
            this.cancel();
        },
        pointermove: function(inEvent) {
            if (this.heldPointer && this.heldPointer.pointerId === inEvent.pointerId) {
                var x = inEvent.clientX - this.heldPointer.clientX, y = inEvent.clientY - this.heldPointer.clientY;
                x * x + y * y > this.WIGGLE_THRESHOLD && this.cancel();
            }
        },
        fireHold: function(inType, inHoldTime) {
            var p = {
                pointerType: this.heldPointer.pointerType
            };
            inHoldTime && (p.holdTime = inHoldTime);
            var e = dispatcher.makeEvent(inType, p);
            dispatcher.dispatchEvent(e, this.target), e.tapPrevented && dispatcher.preventTap(this.heldPointer.pointerId);
        }
    };
    dispatcher.registerRecognizer("hold", hold);
}(window.PointerGestures), function(scope) {
    var dispatcher = scope.dispatcher, pointermap = new scope.PointerMap(), track = {
        events: [ "pointerdown", "pointermove", "pointerup", "pointercancel" ],
        WIGGLE_THRESHOLD: 4,
        clampDir: function(inDelta) {
            return inDelta > 0 ? 1 : -1;
        },
        calcPositionDelta: function(inA, inB) {
            var x = 0, y = 0;
            return inA && inB && (x = inB.pageX - inA.pageX, y = inB.pageY - inA.pageY), {
                x: x,
                y: y
            };
        },
        fireTrack: function(inType, inEvent, inTrackingData) {
            var t = inTrackingData, d = this.calcPositionDelta(t.downEvent, inEvent), dd = this.calcPositionDelta(t.lastMoveEvent, inEvent);
            dd.x && (t.xDirection = this.clampDir(dd.x)), dd.y && (t.yDirection = this.clampDir(dd.y));
            var trackData = {
                dx: d.x,
                dy: d.y,
                ddx: dd.x,
                ddy: dd.y,
                clientX: inEvent.clientX,
                clientY: inEvent.clientY,
                pageX: inEvent.pageX,
                pageY: inEvent.pageY,
                screenX: inEvent.screenX,
                screenY: inEvent.screenY,
                xDirection: t.xDirection,
                yDirection: t.yDirection,
                trackInfo: t.trackInfo,
                pointerType: inEvent.pointerType
            };
            "trackend" === inType && (trackData._releaseTarget = inEvent.target);
            var e = dispatcher.makeEvent(inType, trackData);
            t.lastMoveEvent = inEvent, dispatcher.dispatchEvent(e, t.downTarget);
        },
        pointerdown: function(inEvent) {
            if (inEvent.isPrimary && ("mouse" === inEvent.pointerType ? 1 === inEvent.buttons : !0)) {
                var p = {
                    downEvent: inEvent,
                    downTarget: inEvent.target,
                    trackInfo: {},
                    lastMoveEvent: null,
                    xDirection: 0,
                    yDirection: 0,
                    tracking: !1
                };
                pointermap.set(inEvent.pointerId, p);
            }
        },
        pointermove: function(inEvent) {
            var p = pointermap.get(inEvent.pointerId);
            if (p) if (p.tracking) this.fireTrack("track", inEvent, p); else {
                var d = this.calcPositionDelta(p.downEvent, inEvent), move = d.x * d.x + d.y * d.y;
                move > this.WIGGLE_THRESHOLD && (p.tracking = !0, this.fireTrack("trackstart", p.downEvent, p), 
                this.fireTrack("track", inEvent, p));
            }
        },
        pointerup: function(inEvent) {
            var p = pointermap.get(inEvent.pointerId);
            p && (p.tracking && this.fireTrack("trackend", inEvent, p), pointermap.delete(inEvent.pointerId));
        },
        pointercancel: function(inEvent) {
            this.pointerup(inEvent);
        }
    };
    dispatcher.registerRecognizer("track", track);
}(window.PointerGestures), function(scope) {
    var dispatcher = scope.dispatcher, flick = {
        MIN_VELOCITY: .5,
        MAX_QUEUE: 4,
        moveQueue: [],
        target: null,
        pointerId: null,
        events: [ "pointerdown", "pointermove", "pointerup", "pointercancel" ],
        pointerdown: function(inEvent) {
            inEvent.isPrimary && !this.pointerId && (this.pointerId = inEvent.pointerId, this.target = inEvent.target, 
            this.addMove(inEvent));
        },
        pointermove: function(inEvent) {
            inEvent.pointerId === this.pointerId && this.addMove(inEvent);
        },
        pointerup: function(inEvent) {
            inEvent.pointerId === this.pointerId && this.fireFlick(inEvent), this.cleanup();
        },
        pointercancel: function() {
            this.cleanup();
        },
        cleanup: function() {
            this.moveQueue = [], this.target = null, this.pointerId = null;
        },
        addMove: function(inEvent) {
            this.moveQueue.length >= this.MAX_QUEUE && this.moveQueue.shift(), this.moveQueue.push(inEvent);
        },
        fireFlick: function(inEvent) {
            for (var dt, dx, dy, tx, ty, tv, m, e = inEvent, l = this.moveQueue.length, x = 0, y = 0, v = 0, i = 0; l > i && (m = this.moveQueue[i]); i++) dt = e.timeStamp - m.timeStamp, 
            dx = e.clientX - m.clientX, dy = e.clientY - m.clientY, tx = dx / dt, ty = dy / dt, 
            tv = Math.sqrt(tx * tx + ty * ty), tv > v && (x = tx, y = ty, v = tv);
            var ma = Math.abs(x) > Math.abs(y) ? "x" : "y", a = this.calcAngle(x, y);
            if (Math.abs(v) >= this.MIN_VELOCITY) {
                var ev = dispatcher.makeEvent("flick", {
                    xVelocity: x,
                    yVelocity: y,
                    velocity: v,
                    angle: a,
                    majorAxis: ma,
                    pointerType: inEvent.pointerType
                });
                dispatcher.dispatchEvent(ev, this.target);
            }
        },
        calcAngle: function(inX, inY) {
            return 180 * Math.atan2(inY, inX) / Math.PI;
        }
    };
    dispatcher.registerRecognizer("flick", flick);
}(window.PointerGestures), function(scope) {
    var dispatcher = scope.dispatcher, pointermap = new scope.PointerMap(), tap = {
        events: [ "pointerdown", "pointermove", "pointerup", "pointercancel" ],
        pointerdown: function(inEvent) {
            inEvent.isPrimary && !inEvent.tapPrevented && pointermap.set(inEvent.pointerId, {
                target: inEvent.target,
                x: inEvent.clientX,
                y: inEvent.clientY
            });
        },
        pointermove: function(inEvent) {
            if (inEvent.isPrimary) {
                var start = pointermap.get(inEvent.pointerId);
                start && inEvent.tapPrevented && pointermap.delete(inEvent.pointerId);
            }
        },
        pointerup: function(inEvent) {
            var start = pointermap.get(inEvent.pointerId);
            if (start && !inEvent.tapPrevented) {
                var t = scope.findLCA(start.target, inEvent.target);
                if (t) {
                    var e = dispatcher.makeEvent("tap", {
                        x: inEvent.clientX,
                        y: inEvent.clientY,
                        pointerType: inEvent.pointerType
                    });
                    dispatcher.dispatchEvent(e, t);
                }
            }
            pointermap.delete(inEvent.pointerId);
        },
        pointercancel: function(inEvent) {
            pointermap.delete(inEvent.pointerId);
        },
        preventTap: function(inPointerId) {
            pointermap.delete(inPointerId);
        }
    };
    dispatcher.registerRecognizer("tap", tap);
}(window.PointerGestures);
/*
//@ sourceMappingURL=platform.min.js.map
*/;
require(["appbuilder"]);
