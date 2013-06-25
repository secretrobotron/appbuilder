
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

  var appbuilder = window.appbuilder = {
    createElementOverlays: function () {
      graph_ui_module.createOverlays();
    },
    updateStateListenersOnConnect: function (controller) {
      controller.events.on('connect', function (e) {
        Object.keys(controller.states).forEach(function (type) {
          if (e.detail.type === type && controller.states[type]) {
            e.detail.connection.send();
          }
        });
      });
    },
    initElement: function (element, definition) {
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

      element.addEventListener('mousedown', onMouseDown, false);

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
    }
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
function PointerGestureEvent(a,b){var c=b||{},d=document.createEvent("Event"),e={bubbles:!0,cancelable:!0};return Object.keys(e).forEach(function(a){a in c&&(e[a]=c[a])}),d.initEvent(a,e.bubbles,e.cancelable),Object.keys(c).forEach(function(a){d[a]=b[a]}),d.preventTap=this.preventTap,d}if(window.Platform=window.Platform||{},window.logFlags=window.logFlags||{},function(a){var b=a.flags||{};location.search.slice(1).split("&").forEach(function(a){a=a.split("="),a[0]&&(b[a[0]]=a[1]||!0)}),b.shadow=(b.shadowdom||b.shadow||b.polyfill||!HTMLElement.prototype.webkitCreateShadowRoot)&&"polyfill",a.flags=b}(Platform),"polyfill"===Platform.flags.shadow){var SideTable;"undefined"!=typeof WeakMap&&navigator.userAgent.indexOf("Firefox/")<0?SideTable=WeakMap:function(){var a=Object.defineProperty,b=Object.hasOwnProperty,c=(new Date).getTime()%1e9;SideTable=function(){this.name="__st"+(1e9*Math.random()>>>0)+(c++ +"__")},SideTable.prototype={set:function(b,c){a(b,this.name,{value:c,writable:!0})},get:function(a){return b.call(a,this.name)?a[this.name]:void 0},"delete":function(a){this.set(a,void 0)}}}();var ShadowDOMPolyfill={};!function(a){function b(a){if(!a)throw new Error("Assertion failed")}function c(a,b){return Object.getOwnPropertyNames(b).forEach(function(c){Object.defineProperty(a,c,Object.getOwnPropertyDescriptor(b,c))}),a}function d(a,b){return Object.getOwnPropertyNames(b).forEach(function(c){switch(c){case"arguments":case"caller":case"length":case"name":case"prototype":case"toString":return}Object.defineProperty(a,c,Object.getOwnPropertyDescriptor(b,c))}),a}function e(a){var b=a.__proto__||Object.getPrototypeOf(a),c=z.get(b);if(c)return c;var d=e(b),f=n(d);return k(b,f,a),f}function f(a,b){i(a,b,!0)}function g(a,b){i(b,a,!1)}function h(a){return/^on[a-z]+$/.test(a)}function i(b,c,d){Object.getOwnPropertyNames(b).forEach(function(e){if(!(e in c)){B&&b.__lookupGetter__(e);var f;try{f=Object.getOwnPropertyDescriptor(b,e)}catch(g){f=C}var i,j;if(d&&"function"==typeof f.value)return c[e]=function(){return this.impl[e].apply(this.impl,arguments)},void 0;var k=h(e);i=k?a.getEventHandlerGetter(e):function(){return this.impl[e]},(f.writable||f.set)&&(j=k?a.getEventHandlerSetter(e):function(a){this.impl[e]=a}),Object.defineProperty(c,e,{get:i,set:j,configurable:f.configurable,enumerable:f.enumerable})}})}function j(a,b,c){var e=a.prototype;k(e,b,c),d(b,a)}function k(a,c,d){var e=c.prototype;b(void 0===z.get(a)),z.set(a,c),f(a,e),d&&g(e,d)}function l(a,b){return z.get(b.prototype)===a}function m(a){var b=Object.getPrototypeOf(a),c=e(b),d=n(c);return k(b,d,a),d}function n(a){function b(b){a.call(this,b)}return b.prototype=Object.create(a.prototype),b.prototype.constructor=b,b}function o(a){return a instanceof A.EventTarget||a instanceof A.Event||a instanceof A.DOMImplementation}function p(a){return a instanceof F||a instanceof E||a instanceof G||a instanceof D}function q(a){if(null===a)return null;b(p(a));var c=y.get(a);if(!c){var d=e(a);c=new d(a),y.set(a,c)}return c}function r(a){return null===a?null:(b(o(a)),a.impl)}function s(a){return a&&o(a)?r(a):a}function t(a){return a&&!o(a)?q(a):a}function u(a,c){null!==c&&(b(p(a)),b(void 0===c||o(c)),y.set(a,c))}function v(a,b,c){Object.defineProperty(a.prototype,b,{get:c,configurable:!0,enumerable:!0})}function w(a,b){v(a,b,function(){return q(this.impl[b])})}function x(a,b){a.forEach(function(a){b.forEach(function(b){a.prototype[b]=function(){var a=q(this);return a[b].apply(a,arguments)}})})}var y=new SideTable,z=new SideTable,A=Object.create(null);Object.getOwnPropertyNames(window);var B=/Firefox/.test(navigator.userAgent),C={get:function(){},set:function(){},configurable:!0,enumerable:!0},D=DOMImplementation,E=Event,F=Node,G=Window;a.assert=b,a.defineGetter=v,a.defineWrapGetter=w,a.forwardMethodsToWrapper=x,a.isWrapperFor=l,a.mixin=c,a.registerObject=m,a.registerWrapper=j,a.rewrap=u,a.unwrap=r,a.unwrapIfNeeded=s,a.wrap=q,a.wrapIfNeeded=t,a.wrappers=A}(this.ShadowDOMPolyfill),function(a){function b(a){return a instanceof M.ShadowRoot}function c(a){var b=a.localName;return"content"===b||"shadow"===b}function d(a){return!!a.shadowRoot}function e(a){var b;return a.parentNode||(b=a.defaultView)&&L(b)||null}function f(f,g,h){if(h.length)return h.shift();if(b(f))return j(f)||a.getHostForShadowRoot(f);var i=a.eventParentsTable.get(f);if(i){for(var k=1;k<i.length;k++)h[k-1]=i[k];return i[0]}if(g&&c(f)){var l=f.parentNode;if(l&&d(l))for(var m=a.getShadowTrees(l),n=j(g),k=0;k<m.length;k++)if(m[k].contains(n))return n}return e(f)}function g(a){for(var d=[],e=a,g=[],i=[];e;){var j=null;if(c(e)){j=h(d);var k=d[d.length-1]||e;d.push(k)}else d.length||d.push(e);var l=d[d.length-1];g.push({target:l,currentTarget:e}),b(e)&&d.pop(),e=f(e,j,i)}return g}function h(a){for(var b=a.length-1;b>=0;b--)if(!c(a[b]))return a[b];return null}function i(d,e){for(var g=[];d;){for(var i=[],j=e,l=void 0;j;){var n=null;if(i.length){if(c(j)&&(n=h(i),k(l))){var o=i[i.length-1];i.push(o)}}else i.push(j);if(m(j,d))return i[i.length-1];b(j)&&i.pop(),l=j,j=f(j,n,g)}d=b(d)?a.getHostForShadowRoot(d):d.parentNode}}function j(b){return a.insertionParentTable.get(b)}function k(a){return j(a)}function l(a){for(var b;b=a.parentNode;)a=b;return a}function m(a,b){return l(a)===l(b)}function n(a){switch(a){case"DOMAttrModified":case"DOMAttributeNameChanged":case"DOMCharacterDataModified":case"DOMElementNameChanged":case"DOMNodeInserted":case"DOMNodeInsertedIntoDocument":case"DOMNodeRemoved":case"DOMNodeRemovedFromDocument":case"DOMSubtreeModified":return!0}return!1}function o(b){if(!O.get(b)){O.set(b,!0),n(b.type)||a.renderAllPending();var c=L(b.target),d=L(b);return p(d,c)}}function p(a,b){var c=g(b);return"load"===a.type&&2===c.length&&c[0].target instanceof M.Document&&c.shift(),W.set(a,c),q(a,c)&&r(a,c)&&s(a,c),S.set(a,v.NONE),Q.set(a,null),a.defaultPrevented}function q(a,b){for(var c,d=b.length-1;d>0;d--){var e=b[d].target,f=b[d].currentTarget;if(e!==f&&(c=v.CAPTURING_PHASE,!t(b[d],a,c)))return!1}return!0}function r(a,b){var c=v.AT_TARGET;return t(b[0],a,c)}function s(a,b){for(var c,d=a.bubbles,e=1;e<b.length;e++){var f=b[e].target,g=b[e].currentTarget;if(f===g)c=v.AT_TARGET;else{if(!d||U.get(a))continue;c=v.BUBBLING_PHASE}if(!t(b[e],a,c))return}}function t(a,b,c){var d=a.target,e=a.currentTarget,f=N.get(e);if(!f)return!0;if("relatedTarget"in b){var g=K(b),h=L(g.relatedTarget),j=i(e,h);if(j===d)return!0;R.set(b,j)}S.set(b,c);var k=b.type,l=!1;P.set(b,d),Q.set(b,e);for(var m=0;m<f.length;m++){var n=f[m];if(n.removed)l=!0;else if(!(n.type!==k||!n.capture&&c===v.CAPTURING_PHASE||n.capture&&c===v.BUBBLING_PHASE))try{if("function"==typeof n.handler?n.handler.call(e,b):n.handler.handleEvent(b),U.get(b))return!1}catch(o){window.onerror?window.onerror(o.message):console.error(o)}}if(l){var p=f.slice();f.length=0;for(var m=0;m<p.length;m++)p[m].removed||f.push(p[m])}return!T.get(b)}function u(a,b,c){this.type=a,this.handler=b,this.capture=Boolean(c)}function v(a,b){return a instanceof X?(this.impl=a,void 0):L(z(X,"Event",a,b))}function w(a){return a&&a.relatedTarget?Object.create(a,{relatedTarget:{value:K(a.relatedTarget)}}):a}function x(a,b,c){var d=window[a],e=function(b,c){return b instanceof d?(this.impl=b,void 0):L(z(d,a,b,c))};return e.prototype=Object.create(b.prototype),c&&I(e.prototype,c),d&&J(d,e,document.createEvent(a)),e}function y(a,b){return function(){arguments[b]=K(arguments[b]);var c=K(this);c[a].apply(c,arguments)}}function z(a,b,c,d){if(fb)return new a(c,w(d));var e=K(document.createEvent(b)),f=eb[b],g=[c];return Object.keys(f).forEach(function(a){var b=null!=d&&a in d?d[a]:f[a];"relatedTarget"===a&&(b=K(b)),g.push(b)}),e["init"+b].apply(e,g),e}function A(a){return"function"==typeof a?!0:a&&a.handleEvent}function B(a){this.impl=a}function C(b){return b instanceof M.ShadowRoot&&(b=a.getHostForShadowRoot(b)),K(b)}function D(a){H(a,ib)}function E(b,c,d,e){a.renderAllPending();for(var f=L(jb.call(c.impl,d,e)),h=g(f,this),i=0;i<h.length;i++){var j=h[i];if(j.currentTarget===b)return j.target}return null}function F(a){return function(){var b=V.get(this);return b&&b[a]&&b[a].value||null}}function G(a){var b=a.slice(2);return function(c){var d=V.get(this);d||(d=Object.create(null),V.set(this,d));var e=d[a];if(e&&this.removeEventListener(b,e.wrapped,!1),"function"==typeof c){var f=function(b){var d=c.call(this,b);d===!1?b.preventDefault():"onbeforeunload"===a&&"string"==typeof d&&(b.returnValue=d)};this.addEventListener(b,f,!1),d[a]={value:c,wrapped:f}}}}var H=a.forwardMethodsToWrapper,I=a.mixin,J=a.registerWrapper,K=a.unwrap,L=a.wrap,M=a.wrappers;new SideTable;var N=new SideTable,O=new SideTable,P=new SideTable,Q=new SideTable,R=new SideTable,S=new SideTable,T=new SideTable,U=new SideTable,V=new SideTable,W=new SideTable;u.prototype={equals:function(a){return this.handler===a.handler&&this.type===a.type&&this.capture===a.capture},get removed(){return null===this.handler},remove:function(){this.handler=null}};var X=window.Event;v.prototype={get target(){return P.get(this)},get currentTarget(){return Q.get(this)},get eventPhase(){return S.get(this)},get path(){var a=new M.NodeList,b=W.get(this);if(b){for(var c=0,d=!1,e=Q.get(this),f=b.length-1,g=0;f>=g;g++)if(d||(d=b[g].currentTarget===e),d){var h=b[g].currentTarget;(g!==f||h instanceof M.Node)&&(a[c++]=h)}a.length=c}return a},stopPropagation:function(){T.set(this,!0)},stopImmediatePropagation:function(){T.set(this,!0),U.set(this,!0)}},J(X,v,document.createEvent("Event"));var Y=x("UIEvent",v),Z=x("CustomEvent",v),$={get relatedTarget(){return R.get(this)||L(K(this).relatedTarget)}},_=I({initMouseEvent:y("initMouseEvent",14)},$),ab=I({initFocusEvent:y("initFocusEvent",5)},$),bb=x("MouseEvent",Y,_),cb=x("FocusEvent",Y,ab),db=x("MutationEvent",v,{initMutationEvent:y("initMutationEvent",3),get relatedNode(){return L(this.impl.relatedNode)}}),eb=Object.create(null),fb=function(){try{new window.MouseEvent("click")}catch(a){return!1}return!0}();if(!fb){var gb=function(a,b,c){if(c){var d=eb[c];b=I(I({},d),b)}eb[a]=b};gb("Event",{bubbles:!1,cancelable:!1}),gb("CustomEvent",{detail:null},"Event"),gb("UIEvent",{view:null,detail:0},"Event"),gb("MouseEvent",{screenX:0,screenY:0,clientX:0,clientY:0,ctrlKey:!1,altKey:!1,shiftKey:!1,metaKey:!1,button:0,relatedTarget:null},"UIEvent"),gb("FocusEvent",{relatedTarget:null},"UIEvent")}var hb=window.EventTarget,ib=["addEventListener","removeEventListener","dispatchEvent"];[Element,Window,Document].forEach(function(a){var b=a.prototype;ib.forEach(function(a){Object.defineProperty(b,a+"_",{value:b[a]})})}),B.prototype={addEventListener:function(a,b,c){if(A(b)){var d=new u(a,b,c),e=N.get(this);if(e){for(var f=0;f<e.length;f++)if(d.equals(e[f]))return}else e=[],N.set(this,e);e.push(d);var g=C(this);g.addEventListener_(a,o,!0)}},removeEventListener:function(a,b,c){c=Boolean(c);var d=N.get(this);if(d){for(var e=0,f=!1,g=0;g<d.length;g++)d[g].type===a&&d[g].capture===c&&(e++,d[g].handler===b&&(f=!0,d[g].remove()));if(f&&1===e){var h=C(this);h.removeEventListener_(a,o,!0)}}},dispatchEvent:function(a){var b=C(this);return b.dispatchEvent_(K(a))}},hb&&J(hb,B);var jb=document.elementFromPoint;a.adjustRelatedTarget=i,a.elementFromPoint=E,a.getEventHandlerGetter=F,a.getEventHandlerSetter=G,a.wrapEventTargetMethods=D,a.wrappers.CustomEvent=Z,a.wrappers.Event=v,a.wrappers.EventTarget=B,a.wrappers.FocusEvent=cb,a.wrappers.MouseEvent=bb,a.wrappers.MutationEvent=db,a.wrappers.UIEvent=Y}(this.ShadowDOMPolyfill),function(a){function b(a,b){Object.defineProperty(a,b,{enumerable:!1})}function c(){this.length=0,b(this,"length")}function d(a){if(null==a)return a;for(var b=new c,d=0,e=a.length;e>d;d++)b[d]=f(a[d]);return b.length=e,b}function e(a,b){a.prototype[b]=function(){return d(this.impl[b].apply(this.impl,arguments))}}var f=a.wrap;c.prototype={item:function(a){return this[a]}},b(c.prototype,"item"),a.wrappers.NodeList=c,a.addWrapNodeListMethod=e,a.wrapNodeList=d}(this.ShadowDOMPolyfill),function(a){function b(a){j(a instanceof f)}function c(a,b,c,d){if(a.nodeType!==f.DOCUMENT_FRAGMENT_NODE)return a.parentNode&&a.parentNode.removeChild(a),a.parentNode_=b,a.previousSibling_=c,a.nextSibling_=d,c&&(c.nextSibling_=a),d&&(d.previousSibling_=a),[a];for(var e,g=[];e=a.firstChild;)a.removeChild(e),g.push(e),e.parentNode_=b;for(var h=0;h<g.length;h++)g[h].previousSibling_=g[h-1]||c,g[h].nextSibling_=g[h+1]||d;return c&&(c.nextSibling_=g[0]),d&&(d.previousSibling_=g[g.length-1]),g}function d(a,b){var c=b.length;if(1===c)return m(b[0]);for(var d=m(a.ownerDocument.createDocumentFragment()),e=0;c>e;e++)d.appendChild(m(b[e]));return d}function e(a){for(var b=a.firstChild;b;){j(b.parentNode===a);var c=b.nextSibling,d=m(b),e=d.parentNode;e&&s.call(e,d),b.previousSibling_=b.nextSibling_=b.parentNode_=null,b=c}a.firstChild_=a.lastChild_=null}function f(a){j(a instanceof o),g.call(this,a),this.parentNode_=void 0,this.firstChild_=void 0,this.lastChild_=void 0,this.nextSibling_=void 0,this.previousSibling_=void 0}var g=a.wrappers.EventTarget,h=a.wrappers.NodeList,i=a.defineWrapGetter,j=a.assert,k=a.mixin,l=a.registerWrapper,m=a.unwrap,n=a.wrap,o=window.Node,p=o.prototype.appendChild,q=o.prototype.insertBefore,r=o.prototype.replaceChild,s=o.prototype.removeChild,t=o.prototype.compareDocumentPosition;f.prototype=Object.create(g.prototype),k(f.prototype,{appendChild:function(a){b(a),this.invalidateShadowRenderer();var e=this.lastChild,f=null,g=c(a,this,e,f);return this.lastChild_=g[g.length-1],e||(this.firstChild_=g[0]),p.call(this.impl,d(this,g)),a},insertBefore:function(a,e){if(!e)return this.appendChild(a);b(a),b(e),j(e.parentNode===this),this.invalidateShadowRenderer();var f=e.previousSibling,g=e,h=c(a,this,f,g);this.firstChild===e&&(this.firstChild_=h[0]);var i=m(e),k=i.parentNode;return k&&q.call(k,d(this,h),i),a},removeChild:function(a){if(b(a),a.parentNode!==this)throw new Error("NotFoundError");this.invalidateShadowRenderer();var c=this.firstChild,d=this.lastChild,e=a.nextSibling,f=a.previousSibling,g=m(a),h=g.parentNode;return h&&s.call(h,g),c===a&&(this.firstChild_=e),d===a&&(this.lastChild_=f),f&&(f.nextSibling_=e),e&&(e.previousSibling_=f),a.previousSibling_=a.nextSibling_=a.parentNode_=null,a},replaceChild:function(a,e){if(b(a),b(e),e.parentNode!==this)throw new Error("NotFoundError");this.invalidateShadowRenderer();var f=e.previousSibling,g=e.nextSibling;g===a&&(g=a.nextSibling);var h=c(a,this,f,g);this.firstChild===e&&(this.firstChild_=h[0]),this.lastChild===e&&(this.lastChild_=h[h.length-1]),e.previousSibling_=null,e.nextSibling_=null,e.parentNode_=null;var i=m(e);return i.parentNode&&r.call(i.parentNode,d(this,h),i),e},hasChildNodes:function(){return null===this.firstChild},get parentNode(){return void 0!==this.parentNode_?this.parentNode_:n(this.impl.parentNode)},get firstChild(){return void 0!==this.firstChild_?this.firstChild_:n(this.impl.firstChild)},get lastChild(){return void 0!==this.lastChild_?this.lastChild_:n(this.impl.lastChild)},get nextSibling(){return void 0!==this.nextSibling_?this.nextSibling_:n(this.impl.nextSibling)},get previousSibling(){return void 0!==this.previousSibling_?this.previousSibling_:n(this.impl.previousSibling)},get parentElement(){for(var a=this.parentNode;a&&a.nodeType!==f.ELEMENT_NODE;)a=a.parentNode;return a},get textContent(){for(var a="",b=this.firstChild;b;b=b.nextSibling)a+=b.textContent;return a},set textContent(a){if(e(this),this.invalidateShadowRenderer(),""!==a){var b=this.impl.ownerDocument.createTextNode(a);this.appendChild(b)}},get childNodes(){for(var a=new h,b=0,c=this.firstChild;c;c=c.nextSibling)a[b++]=c;return a.length=b,a},cloneNode:function(a){if(!this.invalidateShadowRenderer())return n(this.impl.cloneNode(a));var b=n(this.impl.cloneNode(!1));if(a)for(var c=this.firstChild;c;c=c.nextSibling)b.appendChild(c.cloneNode(!0));return b},contains:function(a){if(!a)return!1;if(a===this)return!0;var b=a.parentNode;return b?this.contains(b):!1},compareDocumentPosition:function(a){return t.call(this.impl,m(a))}}),i(f,"ownerDocument"),l(o,f,document.createDocumentFragment()),delete f.prototype.querySelector,delete f.prototype.querySelectorAll,f.prototype=k(Object.create(g.prototype),f.prototype),a.wrappers.Node=f}(this.ShadowDOMPolyfill),function(a){function b(a,c){for(var d,e=a.firstElementChild;e;){if(e.matches(c))return e;if(d=b(e,c))return d;e=e.nextElementSibling}return null}function c(a,b,d){for(var e=a.firstElementChild;e;)e.matches(b)&&(d[d.length++]=e),c(e,b,d),e=e.nextElementSibling;return d}var d={querySelector:function(a){return b(this,a)},querySelectorAll:function(a){return c(this,a,new NodeList)}},e={getElementsByTagName:function(a){return this.querySelectorAll(a)},getElementsByClassName:function(a){return this.querySelectorAll("."+a)},getElementsByTagNameNS:function(a,b){if("*"===a)return this.getElementsByTagName(b);for(var c=new NodeList,d=this.getElementsByTagName(b),e=0,f=0;e<d.length;e++)d[e].namespaceURI===a&&(c[f++]=d[e]);return c.length=f,c}};a.GetElementsByInterface=e,a.SelectorsInterface=d}(this.ShadowDOMPolyfill),function(a){function b(a){for(;a&&a.nodeType!==Node.ELEMENT_NODE;)a=a.nextSibling;return a}function c(a){for(;a&&a.nodeType!==Node.ELEMENT_NODE;)a=a.previousSibling;return a}var d=a.wrappers.NodeList,e={get firstElementChild(){return b(this.firstChild)},get lastElementChild(){return c(this.lastChild)},get childElementCount(){for(var a=0,b=this.firstElementChild;b;b=b.nextElementSibling)a++;return a},get children(){for(var a=new d,b=0,c=this.firstElementChild;c;c=c.nextElementSibling)a[b++]=c;return a.length=b,a}},f={get nextElementSibling(){return b(this.nextSibling)},get previousElementSibling(){return c(this.nextSibling)}};a.ChildNodeInterface=f,a.ParentNodeInterface=e}(this.ShadowDOMPolyfill),function(a){function b(a){d.call(this,a)}var c=a.ChildNodeInterface,d=a.wrappers.Node,e=a.mixin,f=a.registerWrapper,g=window.CharacterData;b.prototype=Object.create(d.prototype),e(b.prototype,{get textContent(){return this.data},set textContent(a){this.data=a}}),e(b.prototype,c),f(g,b,document.createTextNode("")),a.wrappers.CharacterData=b}(this.ShadowDOMPolyfill),function(a){function b(a){e.call(this,a)}var c=a.ChildNodeInterface,d=a.GetElementsByInterface,e=a.wrappers.Node,f=a.ParentNodeInterface,g=a.SelectorsInterface;a.addWrapNodeListMethod;var h=a.mixin,i=a.registerWrapper,j=a.wrappers,k=new SideTable,l=window.Element,m=l.prototype.matches||l.prototype.mozMatchesSelector||l.prototype.msMatchesSelector||l.prototype.webkitMatchesSelector;b.prototype=Object.create(e.prototype),h(b.prototype,{createShadowRoot:function(){var b=new j.ShadowRoot(this);return k.set(this,b),a.getRendererForHost(this),this.invalidateShadowRenderer(!0),b},get shadowRoot(){return k.get(this)||null},setAttribute:function(a,b){this.impl.setAttribute(a,b),this.invalidateShadowRenderer()},matches:function(a){return m.call(this.impl,a)}}),l.prototype.webkitCreateShadowRoot&&(b.prototype.webkitCreateShadowRoot=b.prototype.createShadowRoot),h(b.prototype,c),h(b.prototype,d),h(b.prototype,f),h(b.prototype,g),i(l,b),a.wrappers.Element=b}(this.ShadowDOMPolyfill),function(a){function b(a){switch(a){case"&":return"&amp;";case"<":return"&lt;";case'"':return"&quot;"}}function c(a){return a.replace(p,b)}function d(a){switch(a.nodeType){case Node.ELEMENT_NODE:for(var b,d=a.tagName.toLowerCase(),f="<"+d,g=a.attributes,h=0;b=g[h];h++)f+=" "+b.name+'="'+c(b.value)+'"';return f+=">",q[d]?f:f+e(a)+"</"+d+">";case Node.TEXT_NODE:return c(a.nodeValue);case Node.COMMENT_NODE:return"<!--"+c(a.nodeValue)+"-->";default:throw console.error(a),new Error("not implemented")}}function e(a){for(var b="",c=a.firstChild;c;c=c.nextSibling)b+=d(c);return b}function f(a,b,c){var d=c||"div";a.textContent="";var e=n(a.ownerDocument.createElement(d));e.innerHTML=b;for(var f;f=e.firstChild;)a.appendChild(o(f))}function g(a){j.call(this,a)}function h(b){k(g,b,function(){return a.renderAllPending(),this.impl[b]})}function i(b){Object.defineProperty(g.prototype,b,{value:function(){return a.renderAllPending(),this.impl[b].apply(this.impl,arguments)},configurable:!0,enumerable:!0})}var j=a.wrappers.Element,k=a.defineGetter,l=a.mixin,m=a.registerWrapper,n=a.unwrap,o=a.wrap,p=/&|<|"/g,q={area:!0,base:!0,br:!0,col:!0,command:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0},r=window.HTMLElement;g.prototype=Object.create(j.prototype),l(g.prototype,{get innerHTML(){return e(this)},set innerHTML(a){f(this,a,this.tagName)},get outerHTML(){return d(this)},set outerHTML(a){if(this.invalidateShadowRenderer())throw new Error("not implemented");this.impl.outerHTML=a}}),["clientHeight","clientLeft","clientTop","clientWidth","offsetHeight","offsetLeft","offsetTop","offsetWidth","scrollHeight","scrollLeft","scrollTop","scrollWidth"].forEach(h),["getBoundingClientRect","getClientRects","scrollIntoView"].forEach(i),m(r,g,document.createElement("b")),a.wrappers.HTMLElement=g,a.getInnerHTML=e,a.setInnerHTML=f}(this.ShadowDOMPolyfill),function(a){function b(a){c.call(this,a)}var c=a.wrappers.HTMLElement,d=a.mixin,e=a.registerWrapper,f=window.HTMLContentElement;b.prototype=Object.create(c.prototype),d(b.prototype,{get select(){return this.getAttribute("select")},set select(a){this.setAttribute("select",a)},setAttribute:function(a,b){c.prototype.setAttribute.call(this,a,b),"select"===String(a).toLowerCase()&&this.invalidateShadowRenderer(!0)}}),f&&e(f,b),a.wrappers.HTMLContentElement=b}(this.ShadowDOMPolyfill),function(a){function b(a){c.call(this,a),this.olderShadowRoot_=null}var c=a.wrappers.HTMLElement,d=a.mixin,e=a.registerWrapper,f=window.HTMLShadowElement;b.prototype=Object.create(c.prototype),d(b.prototype,{get olderShadowRoot(){return this.olderShadowRoot_},invalidateShadowRenderer:function(){c.prototype.invalidateShadowRenderer.call(this,!0)}}),f&&e(f,b),a.wrappers.HTMLShadowElement=b}(this.ShadowDOMPolyfill),function(a){function b(a){if(!a.defaultView)return a;var b=l.get(a);if(!b){for(b=a.implementation.createHTMLDocument("");b.lastChild;)b.removeChild(b.lastChild);l.set(a,b)}return b}function c(a){for(var c,d=b(a.ownerDocument),e=d.createDocumentFragment();c=a.firstChild;)e.appendChild(c);return e}function d(a){e.call(this,a)}var e=a.wrappers.HTMLElement,f=a.getInnerHTML,g=a.mixin,h=a.registerWrapper,i=a.setInnerHTML,j=a.wrap,k=new SideTable,l=new SideTable,m=window.HTMLTemplateElement;d.prototype=Object.create(e.prototype),g(d.prototype,{get content(){if(m)return j(this.impl.content);var a=k.get(this);return a||(a=c(this),k.set(this,a)),a},get innerHTML(){return f(this.content)},set innerHTML(a){i(this.content,a),this.invalidateShadowRenderer()}}),m&&h(m,d),a.wrappers.HTMLTemplateElement=d}(this.ShadowDOMPolyfill),function(a){function b(a){switch(a.localName){case"content":return new c(a);case"shadow":return new e(a);case"template":return new f(a)}d.call(this,a)}var c=a.wrappers.HTMLContentElement,d=a.wrappers.HTMLElement,e=a.wrappers.HTMLShadowElement,f=a.wrappers.HTMLTemplateElement;a.mixin;var g=a.registerWrapper,h=window.HTMLUnknownElement;b.prototype=Object.create(d.prototype),g(h,b),a.wrappers.HTMLUnknownElement=b}(this.ShadowDOMPolyfill),function(a){var b=a.GetElementsByInterface,c=a.ParentNodeInterface,d=a.SelectorsInterface,e=a.mixin,f=a.registerObject,g=f(document.createDocumentFragment());e(g.prototype,c),e(g.prototype,d),e(g.prototype,b);var h=f(document.createTextNode("")),i=f(document.createComment(""));a.wrappers.Comment=i,a.wrappers.DocumentFragment=g,a.wrappers.Text=h}(this.ShadowDOMPolyfill),function(a){function b(b){var d=i(b.impl.ownerDocument.createDocumentFragment());c.call(this,d),g(d,this);var e=b.shadowRoot;a.nextOlderShadowTreeTable.set(this,e),j.set(this,b)}var c=a.wrappers.DocumentFragment,d=a.elementFromPoint,e=a.getInnerHTML,f=a.mixin,g=a.rewrap,h=a.setInnerHTML,i=a.unwrap,j=new SideTable;b.prototype=Object.create(c.prototype),f(b.prototype,{get innerHTML(){return e(this)},set innerHTML(a){h(this,a),this.invalidateShadowRenderer()},invalidateShadowRenderer:function(){return j.get(this).invalidateShadowRenderer()},elementFromPoint:function(a,b){return d(this,this.ownerDocument,a,b)},getElementById:function(a){return this.querySelector("#"+a)}}),a.wrappers.ShadowRoot=b,a.getHostForShadowRoot=function(a){return j.get(a)}}(this.ShadowDOMPolyfill),function(a){function b(a){a.previousSibling_=a.previousSibling,a.nextSibling_=a.nextSibling,a.parentNode_=a.parentNode}function c(a){a.firstChild_=a.firstChild,a.lastChild_=a.lastChild}function d(a){E(a instanceof D);for(var d=a.firstChild;d;d=d.nextSibling)b(d);c(a)}function e(a){var b=G(a);d(a),b.textContent=""}function f(a,c){var e=G(a),f=G(c);f.nodeType===D.DOCUMENT_FRAGMENT_NODE?d(c):(h(c),b(c)),a.lastChild_=a.lastChild,a.lastChild===a.firstChild&&(a.firstChild_=a.firstChild);var g=H(e.lastChild);g&&(g.nextSibling_=g.nextSibling),e.appendChild(f)}function g(a,c){var d=G(a),e=G(c);b(c),c.previousSibling&&(c.previousSibling.nextSibling_=c),c.nextSibling&&(c.nextSibling.previousSibling_=c),a.lastChild===c&&(a.lastChild_=c),a.firstChild===c&&(a.firstChild_=c),d.removeChild(e)}function h(a){var b=G(a),c=b.parentNode;c&&g(H(c),a)}function i(a,b){k(b).push(a),A(a,b);var c=J.get(a);c||J.set(a,c=[]),c.push(b)}function j(a){I.set(a,[])}function k(a){return I.get(a)}function l(a){for(var b=[],c=0,d=a.firstChild;d;d=d.nextSibling)b[c++]=d;return b}function m(a,b,c){for(var d=l(a),e=0;e<d.length;e++){var f=d[e];if(b(f)){if(c(f)===!1)return}else m(f,b,c)}}function n(a,b){var c=!1;return m(a,u,function(a){j(a);for(var d=0;d<b.length;d++){var e=b[d];void 0!==e&&p(e,a)&&(i(e,a),b[d]=void 0,c=!0)}}),c?b.filter(function(a){return void 0!==a}):b}function o(a,b){for(var c=0;c<b.length;c++)if(b[c]in a)return b[c]}function p(a,b){var c=b.getAttribute("select");if(!c)return!0;if(c=c.trim(),!c)return!0;if(a.nodeType!==D.ELEMENT_NODE)return!1;if(!O.test(c))return!1;if(":"===c[0]&&!P.test(c))return!1;try{return a.matches(c)}catch(d){return!1}}function q(){F=null,R.forEach(function(a){a.render()}),R=[]}function r(a){this.host=a,this.dirty=!1,this.associateNode(a)}function s(a){var b=M.get(a);return b||(b=new r(a),M.set(a,b)),b}function t(a){return"content"===a.localName}function u(a){return"content"===a.localName}function v(a){return"shadow"===a.localName}function w(a){return"shadow"===a.localName}function x(a){return!!a.shadowRoot}function y(a){return L.get(a)}function z(a){for(var b=[],c=a.shadowRoot;c;c=L.get(c))b.push(c);return b}function A(a,b){K.set(a,b)}function B(a){new r(a).render()}var C=a.wrappers.HTMLContentElement,D=a.wrappers.Node,E=a.assert;a.mixin;var F,G=a.unwrap,H=a.wrap,I=new SideTable,J=new SideTable,K=new SideTable,L=new SideTable,M=new SideTable,N=new SideTable,O=/^[*.:#[a-zA-Z_|]/,P=new RegExp("^:("+["link","visited","target","enabled","disabled","checked","indeterminate","nth-child","nth-last-child","nth-of-type","nth-last-of-type","first-child","last-child","first-of-type","last-of-type","only-of-type"].join("|")+")"),Q=o(window,["requestAnimationFrame","mozRequestAnimationFrame","webkitRequestAnimationFrame","setTimeout"]),R=[];r.prototype={render:function(){if(this.dirty){var a=this.host;this.treeComposition();var b=a.shadowRoot;if(b){this.removeAllChildNodes(this.host);var c=l(b);c.forEach(function(c){this.renderNode(a,b,c,!1)},this),this.dirty=!1}}},invalidate:function(){if(!this.dirty){if(this.dirty=!0,R.push(this),F)return;F=window[Q](q,0)}},renderNode:function(a,b,c,d){if(x(c)){this.appendChild(a,c);var e=s(c);e.dirty=!0,e.render()}else t(c)?this.renderInsertionPoint(a,b,c,d):v(c)?this.renderShadowInsertionPoint(a,b,c):this.renderAsAnyDomTree(a,b,c,d)},renderAsAnyDomTree:function(a,b,c,d){if(this.appendChild(a,c),x(c))B(c);else{var e=c,f=l(e);f.forEach(function(a){this.renderNode(e,b,a,d)},this)}},renderInsertionPoint:function(a,b,c,d){var e=k(c);e.length?(this.removeAllChildNodes(c),e.forEach(function(c){t(c)&&d?this.renderInsertionPoint(a,b,c,d):this.renderAsAnyDomTree(a,b,c,d)},this)):this.renderFallbackContent(a,c),this.remove(c)},renderShadowInsertionPoint:function(a,b,c){var d=y(b);if(d){A(d,c),c.olderShadowRoot_=d,this.remove(c);var e=l(d);e.forEach(function(b){this.renderNode(a,d,b,!0)},this)}else this.renderFallbackContent(a,c)},renderFallbackContent:function(a,b){var c=l(b);c.forEach(function(b){this.appendChild(a,b)},this)},treeComposition:function(){var a=this.host,b=a.shadowRoot,c=[],d=l(a);d.forEach(function(a){if(t(a)){var b=k(a);b&&b.length||(b=l(a)),c.push.apply(c,b)}else c.push(a)});for(var e,f;b;){if(e=void 0,m(b,w,function(a){return e=a,!1}),f=e,c=n(b,c),f){var g=y(b);if(g){b=g,A(b,f);continue}break}break}},appendChild:function(a,b){f(a,b),this.associateNode(b)},remove:function(a){h(a),this.associateNode(a)},removeAllChildNodes:function(a){e(a)},associateNode:function(a){N.set(a,this)}},D.prototype.invalidateShadowRenderer=function(a){var b=N.get(this);if(!b)return!1;var c;return(a||this.shadowRoot||(c=this.parentNode)&&(c.shadowRoot||c instanceof ShadowRoot))&&b.invalidate(),!0},C.prototype.getDistributedNodes=function(){return q(),k(this)},a.eventParentsTable=J,a.getRendererForHost=s,a.getShadowTrees=z,a.nextOlderShadowTreeTable=L,a.renderAllPending=q,a.insertionParentTable=K,a.visual={removeAllChildNodes:e,appendChild:f,removeChild:g}}(this.ShadowDOMPolyfill),function(a){function b(a){j.call(this,a)}function c(a){var c=document[a];b.prototype[a]=function(){return t(c.apply(this.impl,arguments))}}function d(a,b){a.shadowRoot&&b.adoptNode(a.shadowRoot),a instanceof m&&e(a,b);for(var c=a.firstChild;c;c=c.nextSibling)d(c,b)}function e(b,c){var d=a.nextOlderShadowTreeTable.get(b);d&&c.adoptNode(d)}function f(a){this.impl=a}function g(a,b){var c=document.implementation[b];a.prototype[b]=function(){return t(c.apply(this.impl,arguments))}}function h(a,b){var c=document.implementation[b];a.prototype[b]=function(){return c.apply(this.impl,arguments)}}var i=a.GetElementsByInterface,j=a.wrappers.Node,k=a.ParentNodeInterface,l=a.SelectorsInterface,m=a.wrappers.ShadowRoot,n=a.defineWrapGetter,o=a.elementFromPoint,p=a.forwardMethodsToWrapper,q=a.mixin,r=a.registerWrapper,s=a.unwrap,t=a.wrap,u=a.wrapEventTargetMethods;a.wrapNodeList;var v=new SideTable;b.prototype=Object.create(j.prototype),n(b,"documentElement"),n(b,"body"),n(b,"head"),["getElementById","createElement","createElementNS","createTextNode","createDocumentFragment","createEvent","createEventNS"].forEach(c);var w=document.adoptNode,x=document.write;q(b.prototype,{adoptNode:function(a){return a.parentNode&&a.parentNode.removeChild(a),w.call(this.impl,s(a)),d(a,this),a},elementFromPoint:function(a,b){return o(this,this,a,b)},write:function(a){for(var b=this.querySelectorAll("*"),c=b[b.length-1];c.nextSibling;)c=c.nextSibling;var d=c.parentNode;d.lastChild_=void 0,c.nextSibling_=void 0,x.call(this.impl,a)}}),p([window.HTMLBodyElement,window.HTMLDocument||window.Document,window.HTMLHeadElement],["appendChild","compareDocumentPosition","getElementsByClassName","getElementsByTagName","getElementsByTagNameNS","insertBefore","querySelector","querySelectorAll","removeChild","replaceChild"]),p([window.HTMLDocument||window.Document],["adoptNode","createDocumentFragment","createElement","createElementNS","createEvent","createEventNS","createTextNode","elementFromPoint","getElementById","write"]),q(b.prototype,i),q(b.prototype,k),q(b.prototype,l),q(b.prototype,{get implementation(){var a=v.get(this);return a?a:(a=new f(s(this).implementation),v.set(this,a),a)}}),r(window.Document,b,document.implementation.createHTMLDocument("")),window.HTMLDocument&&r(window.HTMLDocument,b),u([window.HTMLBodyElement,window.HTMLDocument||window.Document,window.HTMLHeadElement]),g(f,"createDocumentType"),g(f,"createDocument"),g(f,"createHTMLDocument"),h(f,"hasFeature"),r(window.DOMImplementation,f),p([window.DOMImplementation],["createDocumentType","createDocument","createHTMLDocument","hasFeature"]),a.wrappers.Document=b,a.wrappers.DOMImplementation=f
}(this.ShadowDOMPolyfill),function(a){function b(a){c.call(this,a)}var c=a.wrappers.EventTarget,d=a.mixin,e=a.registerWrapper,f=a.unwrap,g=a.unwrapIfNeeded,h=a.wrap,i=window.Window;b.prototype=Object.create(c.prototype);var j=window.getComputedStyle;i.prototype.getComputedStyle=function(a,b){return j.call(this||window,g(a),b)},["addEventListener","removeEventListener","dispatchEvent"].forEach(function(a){i.prototype[a]=function(){var b=h(this||window);return b[a].apply(b,arguments)}}),d(b.prototype,{getComputedStyle:function(a,b){return j.call(f(this),g(a),b)}}),e(i,b),a.wrappers.Window=b}(this.ShadowDOMPolyfill),function(a){function b(a){this.impl=a}function c(a){return new b(a)}function d(a){return a.map(c)}function e(a){var b=this;this.impl=new k(function(c){a.call(b,d(c),b)})}var f=a.defineGetter,g=a.defineWrapGetter,h=a.registerWrapper,i=a.unwrapIfNeeded,j=a.wrapNodeList;a.wrappers;var k=window.MutationObserver||window.WebKitMutationObserver;if(k){var l=window.MutationRecord;b.prototype={get addedNodes(){return j(this.impl.addedNodes)},get removedNodes(){return j(this.impl.removedNodes)}},["target","previousSibling","nextSibling"].forEach(function(a){g(b,a)}),["type","attributeName","attributeNamespace","oldValue"].forEach(function(a){f(b,a,function(){return this.impl[a]})}),l&&h(l,b),window.Node,e.prototype={observe:function(a,b){this.impl.observe(i(a),b)},disconnect:function(){this.impl.disconnect()},takeRecords:function(){return d(this.impl.takeRecords())}},a.wrappers.MutationObserver=e,a.wrappers.MutationRecord=b}}(this.ShadowDOMPolyfill),function(a){function b(a){var b=c[a],d=window[b];if(d){var e=document.createElement(a),f=e.constructor;window[b]=f}}a.isWrapperFor;var c={a:"HTMLAnchorElement",applet:"HTMLAppletElement",area:"HTMLAreaElement",audio:"HTMLAudioElement",br:"HTMLBRElement",base:"HTMLBaseElement",body:"HTMLBodyElement",button:"HTMLButtonElement",canvas:"HTMLCanvasElement",dl:"HTMLDListElement",datalist:"HTMLDataListElement",dir:"HTMLDirectoryElement",div:"HTMLDivElement",embed:"HTMLEmbedElement",fieldset:"HTMLFieldSetElement",font:"HTMLFontElement",form:"HTMLFormElement",frame:"HTMLFrameElement",frameset:"HTMLFrameSetElement",hr:"HTMLHRElement",head:"HTMLHeadElement",h1:"HTMLHeadingElement",html:"HTMLHtmlElement",iframe:"HTMLIFrameElement",input:"HTMLInputElement",li:"HTMLLIElement",label:"HTMLLabelElement",legend:"HTMLLegendElement",link:"HTMLLinkElement",map:"HTMLMapElement",menu:"HTMLMenuElement",menuitem:"HTMLMenuItemElement",meta:"HTMLMetaElement",meter:"HTMLMeterElement",del:"HTMLModElement",ol:"HTMLOListElement",object:"HTMLObjectElement",optgroup:"HTMLOptGroupElement",option:"HTMLOptionElement",output:"HTMLOutputElement",p:"HTMLParagraphElement",param:"HTMLParamElement",pre:"HTMLPreElement",progress:"HTMLProgressElement",q:"HTMLQuoteElement",script:"HTMLScriptElement",select:"HTMLSelectElement",source:"HTMLSourceElement",span:"HTMLSpanElement",style:"HTMLStyleElement",caption:"HTMLTableCaptionElement",col:"HTMLTableColElement",table:"HTMLTableElement",tr:"HTMLTableRowElement",thead:"HTMLTableSectionElement",tbody:"HTMLTableSectionElement",textarea:"HTMLTextAreaElement",title:"HTMLTitleElement",ul:"HTMLUListElement",video:"HTMLVideoElement"};Object.keys(c).forEach(b),Object.getOwnPropertyNames(a.wrappers).forEach(function(b){window[b]=a.wrappers[b]}),a.knownElements=c}(this.ShadowDOMPolyfill),function(){window.wrap=function(a){return a.impl?a:ShadowDOMPolyfill.wrap(a)},window.unwrap=function(a){return a.impl?ShadowDOMPolyfill.unwrap(a):a};var a=window.getComputedStyle;window.getComputedStyle=function(b,c){return a.call(window,wrap(b),c)},Object.defineProperties(HTMLElement.prototype,{webkitShadowRoot:{get:function(){return this.shadowRoot}}}),HTMLElement.prototype.webkitCreateShadowRoot=HTMLElement.prototype.createShadowRoot}()}else{var SideTable;"undefined"!=typeof WeakMap&&navigator.userAgent.indexOf("Firefox/")<0?SideTable=WeakMap:function(){var a=Object.defineProperty,b=Object.hasOwnProperty,c=(new Date).getTime()%1e9;SideTable=function(){this.name="__st"+(1e9*Math.random()>>>0)+(c++ +"__")},SideTable.prototype={set:function(b,c){a(b,this.name,{value:c,writable:!0})},get:function(a){return b.call(a,this.name)?a[this.name]:void 0},"delete":function(a){this.set(a,void 0)}}}(),function(){window.templateContent=window.templateContent||function(a){return a.content},window.wrap=window.unwrap=function(a){return a},Object.defineProperties(HTMLElement.prototype,{shadowRoot:{get:function(){return this.webkitShadowRoot}},createShadowRoot:{value:function(){return this.webkitCreateShadowRoot()}}}),window.templateContent=function(a){if(window.HTMLTemplateElement&&HTMLTemplateElement.bootstrap&&HTMLTemplateElement.bootstrap(a),!a.content&&!a._content){for(var b=document.createDocumentFragment();a.firstChild;)b.appendChild(a.firstChild);a._content=b}return a.content||a._content}}()}if(function(a){function b(a){for(var b=a||{},d=1;d<arguments.length;d++){var e=arguments[d];try{for(var f in e)c(f,e,b)}catch(g){}}return b}function c(a,b,c){var e=d(b,a);Object.defineProperty(c,a,e)}function d(a,b){if(a){var c=Object.getOwnPropertyDescriptor(a,b);return c||d(Object.getPrototypeOf(a),b)}}Function.prototype.bind||(Function.prototype.bind=function(a){var b=this,c=Array.prototype.slice.call(arguments,1);return function(){var d=c.slice();return d.push.apply(d,arguments),b.apply(a,d)}}),a.mixin=b}(window.Platform),function(a){function b(a,b,c){var d="string"==typeof a?document.createElement(a):a.cloneNode(!0);if(d.innerHTML=b,c)for(var e in c)d.setAttribute(e,c[e]);return d}var c=DOMTokenList.prototype.add,d=DOMTokenList.prototype.remove;if(DOMTokenList.prototype.add=function(){for(var a=0;a<arguments.length;a++)c.call(this,arguments[a])},DOMTokenList.prototype.remove=function(){for(var a=0;a<arguments.length;a++)d.call(this,arguments[a])},DOMTokenList.prototype.toggle=function(a,b){1==arguments.length&&(b=!this.contains(a)),b?this.add(a):this.remove(a)},DOMTokenList.prototype.switch=function(a,b){a&&this.remove(a),b&&this.add(b)},NodeList.prototype.forEach=function(a,b){Array.prototype.slice.call(this).forEach(a,b)},HTMLCollection.prototype.forEach=function(a,b){Array.prototype.slice.call(this).forEach(a,b)},!window.performance){var e=Date.now();window.performance={now:function(){return Date.now()-e}}}window.requestAnimationFrame||(window.requestAnimationFrame=function(){var a=window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame;return a?function(b){return a(function(){b(performance.now())})}:function(a){return window.setTimeout(a,1e3/60)}}()),window.cancelAnimationFrame||(window.cancelAnimationFrame=function(){return window.webkitCancelAnimationFrame||window.mozCancelAnimationFrame||function(a){clearTimeout(a)}}()),a.createDOM=b}(window.Platform),window.templateContent=window.templateContent||function(a){return a.content},function(a){a=a||(window.Inspector={});var b;window.sinspect=function(a,d){b||(b=window.open("","ShadowDOM Inspector",null,!0),b.document.write(c),b.api={shadowize:shadowize}),f(a||wrap(document.body),d)};var c=["<!DOCTYPE html>","<html>","  <head>","    <title>ShadowDOM Inspector</title>","    <style>","      body {","      }","      pre {",'        font: 9pt "Courier New", monospace;',"        line-height: 1.5em;","      }","      tag {","        color: purple;","      }","      ul {","         margin: 0;","         padding: 0;","         list-style: none;","      }","      li {","         display: inline-block;","         background-color: #f1f1f1;","         padding: 4px 6px;","         border-radius: 4px;","         margin-right: 4px;","      }","    </style>","  </head>","  <body>",'    <ul id="crumbs">',"    </ul>",'    <div id="tree"></div>',"  </body>","</html>"].join("\n"),d=[],e=function(){var a=b.document,c=a.querySelector("#crumbs");c.textContent="";for(var e,g=0;e=d[g];g++){var h=a.createElement("a");h.href="#",h.textContent=e.localName,h.idx=g,h.onclick=function(a){for(var b;d.length>this.idx;)b=d.pop();f(b.shadow||b,b),a.preventDefault()},c.appendChild(a.createElement("li")).appendChild(h)}},f=function(a,c){var f=b.document;k=[];var g=c||a;d.push(g),e(),f.body.querySelector("#tree").innerHTML="<pre>"+j(a,a.childNodes)+"</pre>"},g=Array.prototype.forEach.call.bind(Array.prototype.forEach),h={STYLE:1,SCRIPT:1,"#comment":1,TEMPLATE:1},i=function(a){return h[a.nodeName]},j=function(a,b,c){if(i(a))return"";var d=c||"";if(a.localName||11==a.nodeType){var e=a.localName||"shadow-root",f=d+l(a);"content"==e&&(b=a.getDistributedNodes()),f+="<br/>";var h=d+"&nbsp;&nbsp;";g(b,function(a){f+=j(a,a.childNodes,h)}),f+=d,{br:1}[e]||(f+="<tag>&lt;/"+e+"&gt;</tag>",f+="<br/>")}else{var k=a.textContent.trim();f=k?d+'"'+k+'"'+"<br/>":""}return f},k=[],l=function(a){var b="<tag>&lt;",c=a.localName||"shadow-root";return a.webkitShadowRoot||a.shadowRoot?(b+=' <button idx="'+k.length+'" onclick="api.shadowize.call(this)">'+c+"</button>",k.push(a)):b+=c||"shadow-root",a.attributes&&g(a.attributes,function(a){b+=" "+a.name+(a.value?'="'+a.value+'"':"")}),b+="&gt;</tag>"};shadowize=function(){var a=Number(this.attributes.idx.value),b=k[a];b?f(b.webkitShadowRoot||b.shadowRoot,b):(console.log("bad shadowize node"),console.dir(this))},a.output=j}(window.Inspector),function(a){function b(){function a(a){"splice"===a[0].type&&"splice"===a[1].type&&(b=!0)}if("function"!=typeof Object.observe&&"function"!=typeof Array.observe)return!1;var b=!1,c=[0];return Array.observe(c,a),c[1]=1,c.length=0,Object.deliverChangeRecords(a),b}function c(a){return+a===a>>>0}function d(a){return+a}function e(a){return a===Object(a)}function f(a,b){return a===b?0!==a||1/a===1/b:O(a)&&O(b)?!0:a!==a&&b!==b}function g(a){return"string"!=typeof a?!1:(a=a.replace(/\s/g,""),""==a?!0:"."==a[0]?!1:W.test(a))}function h(a){return""==a.trim()?this:c(a)?(this.push(String(a)),this):(a.split(/\./).filter(function(a){return a}).forEach(function(a){this.push(a)},this),void 0)}function i(a){for(var b=0;X>b&&a.check();)a.report(),b++}function j(a){for(var b in a)return!1;return!0}function k(a){return j(a.added)&&j(a.removed)&&j(a.changed)}function l(a,b){var c={},d={},e={};for(var f in b){var g=a[f];(void 0===g||g!==b[f])&&(f in a?g!==b[f]&&(e[f]=g):d[f]=void 0)}for(var f in a)f in b||(c[f]=a[f]);return Array.isArray(a)&&a.length!==b.length&&(e.length=a.length),{added:c,removed:d,changed:e}}function m(a,b){var c=b||(Array.isArray(a)?[]:{});for(var d in a)c[d]=a[d];return Array.isArray(a)&&(c.length=a.length),c}function n(a){this.callback=a,this.reporting=!0,K&&(this.boundInternalCallback=this.internalCallback.bind(this)),this.valid=!0,o(this),this.connect(),this.sync(!0)}function o(a){Z&&(Y.push(a),n._allObserversCount++)}function p(a){if(Z)for(var b=0;b<Y.length;b++)if(Y[b]===a){Y[b]=void 0,n._allObserversCount--;break}}function q(a,b){this.object=a,n.call(this,b)}function r(a,b){if(!Array.isArray(a))throw Error("Provided object is not an Array");this.object=a,n.call(this,b)}function s(a,b){if(!b.length)return a;if(e(a)){if(L)return v(a,b);var c;return b.walkPropertiesFrom(a,function(a,d,e){e===b.length&&(c=d)}),c}}function t(a,b,c){if(!b.length||!e(a))return!1;var d=!1;return b.walkPropertiesFrom(a,function(a,f,g){e(f)&&g==b.length-1&&(d=!0,f[a]=c)}),d}function u(a){var b="",c="obj",d=a.length;b+="if (obj";for(var e=0;d-1>e;e++){var f='["'+a[e]+'"]';c+=f,b+=" && "+c}return b+=") ",c+='["'+a[d-1]+'"]',b+="return "+c+"; else return undefined;",new Function("obj",b)}function v(a,b){var c=b.toString();return _[c]||(_[c]=u(b)),_[c](a)}function w(b,c,d,f,g){var h=void 0;return c.walkPropertiesFrom(b,function(b,i,j){if(j===c.length)return h=i,void 0;var k=d[j];if(!k||i!==k[0]){if(k)for(var l=0;l<k.length;l++){var m=k[l],n=f.get(m);1==n?(f.delete(m),a.unobserveCount++,Object.unobserve(m,g)):f.set(m,n-1)}if(k=i,e(k)){for(var k=[];e(i);){k.push(i);var n=f.get(i);n?f.set(i,n+1):(f.set(i,1),a.observeCount++,Object.observe(i,g)),i=Object.getPrototypeOf(i)}d[j]=k}}},this),h}function x(a,b,c){if(this.value=void 0,g(b)){var d=new h(b);return d.length?(e(a)&&(this.object=a,this.path=d,K?(this.observed=new Array(d.length),this.observedMap=new Map,this.getPathValue=w):this.getPathValue=s,n.call(this,c)),void 0):(this.value=a,void 0)}}function y(a,b){if("function"==typeof Object.observe){var c=Object.getNotifier(a);return function(d,e){var f={object:a,type:d,name:b};2===arguments.length&&(f.oldValue=e),c.notify(f)}}}function z(a,b,c){for(var d={},e={},f=0;f<b.length;f++){var g=b[f];ab[g.type]?(g.name in c||(c[g.name]=g.oldValue),"updated"!=g.type&&("new"!=g.type?g.name in d?(delete d[g.name],delete c[g.name]):e[g.name]=!0:g.name in e?delete e[g.name]:d[g.name]=!0)):(console.error("Unknown changeRecord type: "+g.type),console.error(g))}for(var h in d)d[h]=a[h];for(var h in e)e[h]=void 0;var i={};for(var h in c)if(!(h in d||h in e)){var j=a[h];c[h]!==j&&(i[h]=j)}return{added:d,removed:e,changed:i}}function A(a,b,c,d,e,f){for(var g=f-e+1,h=c-b+1,i=new Array(g),j=0;g>j;j++)i[j]=new Array(h),i[j][0]=j;for(var k=0;h>k;k++)i[0][k]=k;for(var j=1;g>j;j++)for(var k=1;h>k;k++)if(d[e+j-1]===a[b+k-1])i[j][k]=i[j-1][k-1];else{var l=i[j-1][k]+1,m=i[j][k-1]+1;i[j][k]=m>l?l:m}return i}function B(a){for(var b=a.length-1,c=a[0].length-1,d=a[b][c],e=[];b>0||c>0;)if(0!=b)if(0!=c){var f,g=a[b-1][c-1],h=a[b-1][c],i=a[b][c-1];f=i>h?g>h?h:g:g>i?i:g,f==g?(g==d?e.push(bb):(e.push(cb),d=g),b--,c--):f==h?(e.push(eb),b--,d=h):(e.push(db),c--,d=i)}else e.push(eb),b--;else e.push(db),c--;return e.reverse(),e}function C(a,b,c){for(var d=0;c>d;d++)if(a[d]!==b[d])return d;return c}function D(a,b,c){for(var d=a.length,e=b.length,f=0;c>f&&a[--d]===b[--e];)f++;return f}function E(a,b,c){return{index:a,removed:b,addedCount:c}}function F(a,b,c,d,e,f){var g=0,h=0,i=Math.min(c-b,f-e);if(0==b&&0==e&&(g=C(a,d,i)),c==a.length&&f==d.length&&(h=D(a,d,i-g)),b+=g,e+=g,c-=h,f-=h,0==c-b&&0==f-e)return[];if(b==c){for(var j=E(b,[],0);f>e;)j.removed.push(d[e++]);return[j]}if(e==f)return[E(b,[],c-b)];for(var k=B(A(a,b,c,d,e,f)),j=void 0,l=[],m=b,n=e,o=0;o<k.length;o++)switch(k[o]){case bb:j&&(l.push(j),j=void 0),m++,n++;break;case cb:j||(j=E(m,[],0)),j.addedCount++,m++,j.removed.push(d[n]),n++;break;case db:j||(j=E(m,[],0)),j.addedCount++,m++;break;case eb:j||(j=E(m,[],0)),j.removed.push(d[n]),n++}return j&&l.push(j),l}function G(a,b,c,d){return c>b||a>d?-1:b==c||d==a?0:c>a?d>b?b-c:d-c:b>d?d-a:b-a}function H(a,b,c,d){for(var e=E(b,c,d),f=!1,g=0,h=0;h<a.length;h++){var i=a[h];if(i.index+=g,!f){var j=G(e.index,e.index+e.removed.length,i.index,i.index+i.addedCount);if(j>=0){a.splice(h,1),h--,g-=i.addedCount-i.removed.length,e.addedCount+=i.addedCount-j;var k=e.removed.length+i.removed.length-j;if(e.addedCount||k){var c=i.removed;if(e.index<i.index){var l=e.removed.slice(0,i.index-e.index);Array.prototype.push.apply(l,c),c=l}if(e.index+e.removed.length>i.index+i.addedCount){var m=e.removed.slice(i.index+i.addedCount-e.index);Array.prototype.push.apply(c,m)}e.removed=c,i.index<e.index&&(e.index=i.index)}else f=!0}else if(e.index<i.index){f=!0,a.splice(h,0,e),h++;var n=e.addedCount-e.removed.length;i.index+=n,g+=n}}}f||a.push(e)}function I(a,b){for(var e=[],f=0;f<b.length;f++){var g=b[f];switch(g.type){case"splice":H(e,g.index,g.removed.slice(),g.addedCount);break;case"new":case"updated":case"deleted":if(!c(g.name))continue;var h=d(g.name);if(0>h)continue;H(e,h,[g.oldValue],1);break;default:console.error("Unexpected record type: "+JSON.stringify(g))}}return e}function J(a,b){var c=[];return I(a,b).forEach(function(b){return 1==b.addedCount&&1==b.removed.length?(b.removed[0]!==a[b.index]&&c.push(b),void 0):(c=c.concat(F(a,b.index,b.index+b.addedCount,b.removed,0,b.removed.length)),void 0)}),c}var K=b(),L=!1;try{var M=new Function("","return true;");L=M()}catch(N){}var O=a.Number.isNaN||function(b){return"number"==typeof b&&a.isNaN(b)},P="__proto__"in{}?function(a){return a}:function(a){var b=a.__proto__;if(!b)return a;var c=Object.create(b);return Object.getOwnPropertyNames(a).forEach(function(b){Object.defineProperty(c,b,Object.getOwnPropertyDescriptor(a,b))}),c},Q="[$_a-zA-Z]",R="[$_a-zA-Z0-9]",S=Q+"+"+R+"*",T="(?:[0-9]|[1-9]+[0-9]+)",U="(?:"+S+"|"+T+")",V="(?:"+U+")(?:\\."+U+")*",W=new RegExp("^"+V+"$");h.prototype=P({__proto__:[],toString:function(){return this.join(".")},walkPropertiesFrom:function(a,b,c){for(var d,e=0;e<this.length+1;e++)d=this[e],b.call(c,d,a,e),a=e==this.length||null===a||void 0===a?void 0:a[d]}});var X=1e3;n.prototype={valid:!1,internalCallback:function(a){this.valid&&this.reporting&&this.check(a)&&(this.report(),this.testingResults&&(this.testingResults.anyChanged=!0))},close:function(){this.valid&&(this.disconnect(),this.valid=!1,p(this))},deliver:function(a){this.valid&&(K?(this.testingResults=a,Object.deliverChangeRecords(this.boundInternalCallback),this.testingResults=void 0):i(this))},report:function(){if(this.reporting){this.sync(!1);try{this.callback.apply(void 0,this.reportArgs)}catch(a){n._errorThrownDuringCallback=!0,console.error("Exception caught during observer callback: "+a)}this.reportArgs=void 0}},reset:function(){this.valid&&(K&&(this.reporting=!1,Object.deliverChangeRecords(this.boundInternalCallback),this.reporting=!0),this.sync(!0))}};var Y,Z=!K||a.forceCollectObservers;Z&&(Y=[],n._allObserversCount=0);var $=!1;a.Platform=a.Platform||{},a.Platform.performMicrotaskCheckpoint=function(){if(Z&&!$){$=!0;var a=0,b={};do{a++;var c=Y;Y=[],b.anyChanged=!1;for(var d=0;d<c.length;d++){var e=c[d];e&&e.valid&&(K?e.deliver(b):e.check()&&(b.anyChanged=!0,e.report()),Y.push(e))}}while(X>a&&b.anyChanged);n._allObserversCount=Y.length,$=!1}},Z&&(a.Platform.clearObservers=function(){Y=[]}),q.prototype=P({__proto__:n.prototype,connect:function(){K&&Object.observe(this.object,this.boundInternalCallback)},sync:function(){K||(this.oldObject=m(this.object))},check:function(a){var b,c;if(K){if(!a)return!1;c={},b=z(this.object,a,c)}else c=this.oldObject,b=l(this.object,this.oldObject);return k(b)?!1:(this.reportArgs=[b.added||{},b.removed||{},b.changed||{}],this.reportArgs.push(function(a){return c[a]}),!0)},disconnect:function(){K?this.object&&Object.unobserve(this.object,this.boundInternalCallback):this.oldObject=void 0,this.object=void 0}}),r.prototype=P({__proto__:q.prototype,connect:function(){K&&Array.observe(this.object,this.boundInternalCallback)},sync:function(){K||(this.oldObject=this.object.slice())},check:function(a){var b;if(K){if(!a)return!1;b=J(this.object,a)}else b=F(this.object,0,this.object.length,this.oldObject,0,this.oldObject.length);return b&&b.length?(this.reportArgs=[b],!0):!1}}),r.applySplices=function(a,b,c){c.forEach(function(c){for(var d=[c.index,c.removed.length],e=c.index;e<c.index+c.addedCount;)d.push(b[e]),e++;Array.prototype.splice.apply(a,d)})};var _={};x.prototype=P({__proto__:n.prototype,connect:function(){},disconnect:function(){this.object=void 0,this.value=void 0,this.sync(!0)},check:function(){return this.value=this.getPathValue(this.object,this.path,this.observed,this.observedMap,this.boundInternalCallback),f(this.value,this.oldValue)?!1:(this.reportArgs=[this.value,this.oldValue],!0)},sync:function(a){a&&(this.value=this.getPathValue(this.object,this.path,this.observed,this.observedMap,this.boundInternalCallback)),this.oldValue=this.value}}),x.getValueAtPath=function(a,b){if(!g(b))return void 0;var c=new h(b);return s(a,c)},x.setValueAtPath=function(a,b,c){if(g(b)){var d=new h(b);t(a,d,c)}};var ab={"new":!0,updated:!0,deleted:!0};x.defineProperty=function(a,b,c){var d=c.object,e=new h(c.path),f=y(a,b),g=new x(d,c.path,function(a,b){f&&f("updated",b)});return Object.defineProperty(a,b,{get:function(){return s(d,e)},set:function(a){t(d,e,a)},configurable:!0}),{close:function(){f&&g.deliver(),g.close(),delete a[b]}}};var bb=0,cb=1,db=2,eb=3;a.Observer=n,a.Observer.hasObjectObserve=K,a.ArrayObserver=r,a.ArrayObserver.calculateSplices=function(a,b){return F(a,0,a.length,b,0,b.length)},a.ObjectObserver=q,a.PathObserver=x}(this),function(a){function b(a){if(!a)throw new Error("Assertion failed")}function c(a){for(;a.parentNode;)a=a.parentNode;return"function"==typeof a.getElementById?a:null}function d(a){return a.ownerDocument.contains(a)}function e(a,b,c){console.error("Unhandled binding to Node: ",this,a,b,c)}function f(){}function g(){}function h(a,b,c){this.model=a,this.path=b,this.changed=c,this.observer=new PathObserver(this.model,this.path,this.changed),this.changed(this.observer.value)}function i(a){return function(b){a.data=void 0==b?"":String(b)}}function j(a,b,c){if("textContent"!==a)return Node.prototype.bind.call(this,a,b,c);this.unbind("textContent");var d=new h(b,c,i(this));ab.set(this,d)}function k(a){if("textContent"!=a)return Node.prototype.unbind.call(this,a);var b=ab.get(this);b&&(b.dispose(),ab.delete(this))}function l(){this.unbind("textContent"),Node.prototype.unbindAll.call(this)}function m(a,b,c){return c?function(c){c?a.setAttribute(b,""):a.removeAttribute(b)}:function(c){a.setAttribute(b,String(void 0===c?"":c))}}function n(){this.bindingMap=Object.create(null)}function o(a,b,c){var d=bb.get(this);d||(d=new n,bb.set(this,d)),d.add(this,a,b,c)}function p(a){var b=bb.get(this);b&&b.remove(a)}function q(){var a=bb.get(this);a&&(bb.delete(this),a.removeAll(),Node.prototype.unbindAll.call(this))}function r(a){switch(a.type){case"checkbox":return cb;case"radio":case"select-multiple":case"select-one":return"change";default:return"input"}}function s(a,b,c,d){this.element=a,this.valueProperty=b,this.boundValueChanged=this.valueChanged.bind(this),this.boundUpdateBinding=this.updateBinding.bind(this),this.binding=new h(c,d,this.boundValueChanged),this.element.addEventListener(r(this.element),this.boundUpdateBinding,!0)}function t(a,b,c){s.call(this,a,"value",b,c)}function u(a){if(!d(a))return[];if(a.form)return Z(a.form.elements,function(b){return b!=a&&"INPUT"==b.tagName&&"radio"==b.type&&b.name==a.name});var b=a.ownerDocument.querySelectorAll('input[type="radio"][name="'+a.name+'"]');return Z(b,function(b){return b!=a&&!b.form})}function v(a,b,c){s.call(this,a,"checked",b,c)}function w(a,b,c){switch(this.tagName+"."+a.toLowerCase()){case"INPUT.value":case"TEXTAREA.value":this.unbind("value"),this.removeAttribute("value"),db.set(this,new t(this,b,c));break;case"INPUT.checked":this.unbind("checked"),this.removeAttribute("checked"),eb.set(this,new v(this,b,c));break;case"SELECT.selectedindex":this.unbind("selectedindex"),this.removeAttribute("selectedindex"),db.set(this,new z(this,b,c));break;default:return Element.prototype.bind.call(this,a,b,c)}}function x(a){switch(this.tagName+"."+a.toLowerCase()){case"INPUT.value":case"TEXTAREA.value":var b=db.get(this);b&&(b.unbind(),db.delete(this));break;case"INPUT.checked":var c=eb.get(this);c&&(c.unbind(),eb.delete(this));break;case"SELECT.selectedindex":var b=db.get(this);b&&(b.unbind(),db.delete(this));break;default:return Element.prototype.unbind.call(this,a)}}function y(){switch(this.tagName){case"INPUT":this.unbind("checked");case"TEXTAREA":this.unbind("value");break;case"SELECT":this.unbind("selectedindex")}Element.prototype.unbindAll.call(this)}function z(a,b,c){s.call(this,a,"selectedIndex",b,c)}function A(a){return lb[a.tagName]&&a.hasAttribute("template")}function B(a){return"TEMPLATE"==a.tagName||A(a)}function C(a){return mb&&"TEMPLATE"==a.tagName}function D(a,b){var c=a.querySelectorAll(nb);B(a)&&b(a),Y(c,b)}function E(a){function b(a){HTMLTemplateElement.decorate(a)||E(a.content)}D(a,b)}function F(a,b){Object.getOwnPropertyNames(b).forEach(function(c){Object.defineProperty(a,c,Object.getOwnPropertyDescriptor(b,c))})}function G(a){if(!a.defaultView)return a;var b=rb.get(a);if(!b){for(b=a.implementation.createHTMLDocument("");b.lastChild;)b.removeChild(b.lastChild);rb.set(a,b)}return b}function H(a){var b=a.ownerDocument.createElement("template");a.parentNode.insertBefore(b,a);for(var c=a.attributes,d=c.length;d-->0;){var e=c[d];kb[e.name]&&("template"!==e.name&&b.setAttribute(e.name,e.value),a.removeAttribute(e.name))}return b}function I(a,b,c){var d=a.content;if(c)return d.appendChild(b),void 0;for(var e;e=b.firstChild;)d.appendChild(e)}function J(a){"TEMPLATE"===a.tagName?mb||(pb?a.__proto__=HTMLTemplateElement.prototype:F(a,HTMLTemplateElement.prototype)):(F(a,HTMLTemplateElement.prototype),Object.defineProperty(a,"content",ub))}function K(a){var b=xb.get(a);b||(b=function(){Q(a,a.model,a.bindingDelegate)},xb.set(a,b)),ob(b)}function L(a,b){this.type=a,this.value=b}function M(a){for(var b=[],c=a.length,d=0,e=0;c>e;){if(d=a.indexOf("{{",e),0>d){b.push(new L(yb,a.slice(e)));break}if(d>0&&d>e&&b.push(new L(yb,a.slice(e,d))),e=d+2,d=a.indexOf("}}",e),0>d){var f=a.slice(e-2),g=b[b.length-1];g&&g.type==yb?g.value+=f:b.push(new L(yb,f));break}var h=a.slice(e,d).trim();b.push(new L(zb,h)),e=d+2}return b}function N(a,b,c,d,e){var f,g=e&&e[ib];g&&"function"==typeof g&&(f=g(c,d,b,a),f&&(c=f,d="value")),a.bind(b,c,d)}function O(a,b,c,d,e){var f=M(c);if(f.length&&(1!=f.length||f[0].type!=yb)){if(1==f.length&&f[0].type==zb)return N(a,b,d,f[0].value,e),void 0;for(var g=new V,h=0;h<f.length;h++){var i=f[h];i.type==zb&&N(g,h,d,i.value,e)}g.combinator=function(a){for(var b="",c=0;c<f.length;c++){var d=f[c];if(d.type===yb)b+=d.value;else{var e=a[c];void 0!==e&&(b+=e)}}return b},a.bind(b,g,"value")}}function P(a,c,d){b(a);for(var e={},f=0;f<a.attributes.length;f++){var g=a.attributes[f];e[g.name]=g.value}B(a)&&(""===e[fb]&&(e[fb]="{{}}"),""===e[gb]&&(e[gb]="{{}}"),void 0!==e[hb]&&void 0===e[fb]&&void 0===e[gb]&&(e[fb]="{{}}")),Object.keys(e).forEach(function(b){O(a,b,e[b],c,d)})}function Q(a,c,d){b(a),a.nodeType===Node.ELEMENT_NODE?P(a,c,d):a.nodeType===Node.TEXT_NODE&&O(a,"textContent",a.data,c,d);for(var e=a.firstChild;e;e=e.nextSibling)Q(e,c,d)}function R(a){if(Ab.delete(a),B(a)){var b=Bb.get(a);b&&(b.abandon(),Bb.delete(a))}a.unbindAll();for(var c=a.firstChild;c;c=c.nextSibling)R(c)}function S(a,b){var c=a.cloneNode(!1);B(c)&&(HTMLTemplateElement.decorate(c,a),b&&wb.set(c,b));for(var d=a.firstChild;d;d=d.nextSibling)c.appendChild(S(d,b));return c}function T(a,b,c){this.firstNode=a,this.lastNode=b,this.model=c}function U(a,b){if(a.firstChild)for(var c=new T(a.firstChild,a.lastChild,b),d=c.firstNode;d;)Ab.set(d,c),d=d.nextSibling}function V(a){this.bindings={},this.values={},this.value=void 0,this.size=0,this.combinator_=a,this.boundResolve=this.resolve.bind(this),this.disposed=!1}function W(a){this.templateElement_=a,this.terminators=[],this.iteratedValue=void 0,this.arrayObserver=void 0,this.boundHandleSplices=this.handleSplices.bind(this),this.inputs=new V(this.resolveInputs.bind(this))}var X,Y=Array.prototype.forEach.call.bind(Array.prototype.forEach),Z=Array.prototype.filter.call.bind(Array.prototype.filter);a.Map&&"function"==typeof a.Map.prototype.forEach?X=a.Map:(X=function(){this.keys=[],this.values=[]},X.prototype={set:function(a,b){var c=this.keys.indexOf(a);0>c?(this.keys.push(a),this.values.push(b)):this.values[c]=b},get:function(a){var b=this.keys.indexOf(a);if(!(0>b))return this.values[b]},"delete":function(a){var b=this.keys.indexOf(a);return 0>b?!1:(this.keys.splice(b,1),this.values.splice(b,1),!0)},forEach:function(a,b){for(var c=0;c<this.keys.length;c++)a.call(b||this,this.values[c],this.keys[c],this)}});var $="__proto__"in{}?function(a){return a}:function(a){var b=a.__proto__;if(!b)return a;var c=Object.create(b);return Object.getOwnPropertyNames(a).forEach(function(b){Object.defineProperty(c,b,Object.getOwnPropertyDescriptor(a,b))}),c};"function"!=typeof document.contains&&(Document.prototype.contains=function(a){return a===this||a.parentNode===this?!0:this.documentElement.contains(a)});var _;"undefined"!=typeof WeakMap&&navigator.userAgent.indexOf("Firefox/")<0?_=WeakMap:function(){var a=Object.defineProperty,b=Object.hasOwnProperty,c=(new Date).getTime()%1e9;_=function(){this.name="__st"+(1e9*Math.random()>>>0)+(c++ +"__")},_.prototype={set:function(b,c){a(b,this.name,{value:c,writable:!0})},get:function(a){return b.call(a,this.name)?a[this.name]:void 0},"delete":function(a){this.set(a,void 0)}}}(),Node.prototype.bind=e,Node.prototype.unbind=f,Node.prototype.unbindAll=g;var ab=new _;h.prototype={dispose:function(){this.model&&"function"==typeof this.model.dispose&&this.model.dispose(),this.observer.close()},set value(a){PathObserver.setValueAtPath(this.model,this.path,a)},reset:function(){this.observer.reset()}},Text.prototype.bind=j,Text.prototype.unbind=k,Text.prototype.unbindAll=l;var bb=new _;n.prototype={add:function(a,b,c,d){a.removeAttribute(b);var e="?"==b[b.length-1];e&&(b=b.slice(0,-1)),this.remove(b);var f=new h(c,d,m(a,b,e));this.bindingMap[b]=f},remove:function(a){var b=this.bindingMap[a];b&&(b.dispose(),delete this.bindingMap[a])},removeAll:function(){Object.keys(this.bindingMap).forEach(function(a){this.remove(a)},this)}},Element.prototype.bind=o,Element.prototype.unbind=p,Element.prototype.unbindAll=q;var cb,db=new _,eb=new _;!function(){var a=document.createElement("div"),b=a.appendChild(document.createElement("input"));b.setAttribute("type","checkbox");var c,d=0;b.addEventListener("click",function(){d++,c=c||"click"}),b.addEventListener("change",function(){d++,c=c||"change"});var e=document.createEvent("MouseEvent");e.initMouseEvent("click",!0,!0,window,0,0,0,0,0,!1,!1,!1,!1,0,null),b.dispatchEvent(e),cb=1==d?"change":c}(),s.prototype={valueChanged:function(a){this.element[this.valueProperty]=this.produceElementValue(a)},updateBinding:function(){this.binding.value=this.element[this.valueProperty],this.binding.reset(),this.postUpdateBinding&&this.postUpdateBinding(),Platform.performMicrotaskCheckpoint()},unbind:function(){this.binding.dispose(),this.element.removeEventListener(r(this.element),this.boundUpdateBinding,!0)}},t.prototype=$({__proto__:s.prototype,produceElementValue:function(a){return String(null==a?"":a)}}),v.prototype=$({__proto__:s.prototype,produceElementValue:function(a){return Boolean(a)},postUpdateBinding:function(){"INPUT"===this.element.tagName&&"radio"===this.element.type&&u(this.element).forEach(function(a){var b=eb.get(a);b&&(b.binding.value=!1)})}}),HTMLInputElement.prototype.bind=w,HTMLInputElement.prototype.unbind=x,HTMLInputElement.prototype.unbindAll=y,z.prototype=$({__proto__:s.prototype,valueChanged:function(a){function b(){a>d.element.length&&c--?ob(b):d.element[d.valueProperty]=a}var a=this.produceElementValue(a);if(a<=this.element.length)return this.element[this.valueProperty]=a,void 0;var c=2,d=this;ob(b)},produceElementValue:function(a){return Number(a)}}),HTMLSelectElement.prototype.bind=w,HTMLSelectElement.prototype.unbind=x,HTMLSelectElement.prototype.unbindAll=y,HTMLTextAreaElement.prototype.bind=w,HTMLTextAreaElement.prototype.unbind=x,HTMLTextAreaElement.prototype.unbindAll=y;var fb="bind",gb="repeat",hb="if",ib="getBinding",jb="getInstanceModel",kb={template:!0,repeat:!0,bind:!0,ref:!0},lb={THEAD:!0,TBODY:!0,TFOOT:!0,TH:!0,TR:!0,TD:!0,COLGROUP:!0,COL:!0,CAPTION:!0,OPTION:!0,OPTGROUP:!0},mb="undefined"!=typeof HTMLTemplateElement,nb="template, "+Object.keys(lb).map(function(a){return a.toLowerCase()+"[template]"}).join(", "),ob=function(){function a(){var a=this;this.value=!1;var b=this.value,e=[],f=!1;this.schedule=function(c){return e.indexOf(c)>=0?!0:f?!1:(e.push(c),b===a.value&&(a.value=!a.value),!0)},new PathObserver(this,"value",function(){f=!0;for(var g=0;g<e.length;g++){var h=e[g];e[g]=void 0,h()}e=[],b=a.value,c=d,d=a,f=!1})}function b(a){c.schedule(a)||d.schedule(a)}var c,d;return c=new a,d=new a,b}();document.addEventListener("DOMContentLoaded",function(){E(document),Platform.performMicrotaskCheckpoint()},!1),mb||(a.HTMLTemplateElement=function(){throw TypeError("Illegal constructor")});var pb="__proto__"in{},qb=new _,rb=new _,sb=new _;HTMLTemplateElement.decorate=function(a,c){if(a.templateIsDecorated_)return!1;var d=a,e=C(d),f=e,g=!e,h=!1;if(!e&&A(d)&&(b(!c),d=H(a),e=C(d),h=!0),d.templateIsDecorated_=!0,!e){J(d);
var i=G(d.ownerDocument);qb.set(d,i.createDocumentFragment())}return c?sb.set(d,c):g?I(d,a,h):f&&E(d.content),!0},HTMLTemplateElement.bootstrap=E;var tb=a.HTMLUnknownElement||HTMLElement,ub={get:function(){return qb.get(this)},enumerable:!0,configurable:!0};mb||(HTMLTemplateElement.prototype=Object.create(tb.prototype),Object.defineProperty(HTMLTemplateElement.prototype,"content",ub));var vb=new _,wb=new _,xb=new _;F(HTMLTemplateElement.prototype,{bind:function(a,b,c){switch(a){case fb:case gb:case hb:var d=Bb.get(this);d||(d=new W(this),Bb.set(this,d)),d.inputs.bind(a,b,c||"");break;default:return Element.prototype.bind.call(this,a,b,c)}},unbind:function(a,b,c){switch(a){case fb:case gb:case hb:var d=Bb.get(this);if(!d)break;d.inputs.unbind(a);break;default:return Element.prototype.unbind.call(this,a,b,c)}},unbindAll:function(){this.unbind(fb),this.unbind(gb),this.unbind(hb),Element.prototype.unbindAll.call(this)},createInstance:function(a,b){var c=S(this.ref.content,b);return"function"==typeof HTMLTemplateElement.__instanceCreated&&HTMLTemplateElement.__instanceCreated(c),Q(c,a,b),U(c,a),c},get model(){return vb.get(this)},set model(a){vb.set(this,a),K(this)},get bindingDelegate(){return wb.get(this)},set bindingDelegate(a){wb.set(this,a),K(this)},get ref(){var a,b=this.getAttribute("ref");if(b){var d=c(this);d&&(a=d.getElementById(b))}if(a||(a=sb.get(this)),!a)return this;var e=a.ref;return e?e:a}});var yb=0,zb=1,Ab=new _;Object.defineProperty(Node.prototype,"templateInstance",{get:function(){var a=Ab.get(this);return a?a:this.parentNode?this.parentNode.templateInstance:void 0}}),V.prototype={set combinator(a){this.combinator_=a,this.scheduleResolve()},bind:function(a,b,c){this.unbind(a),this.size++,this.bindings[a]=new h(b,c,function(b){this.values[a]=b,this.scheduleResolve()}.bind(this))},unbind:function(a,b){this.bindings[a]&&(this.size--,this.bindings[a].dispose(),delete this.bindings[a],delete this.values[a],b||this.scheduleResolve())},scheduleResolve:function(){ob(this.boundResolve)},resolve:function(){if(!this.disposed){if(!this.combinator_)throw Error("CompoundBinding attempted to resolve without a combinator");this.value=this.combinator_(this.values)}},dispose:function(){Object.keys(this.bindings).forEach(function(a){this.unbind(a,!0)},this),this.disposed=!0,this.value=void 0}},W.prototype={resolveInputs:function(a){hb in a&&!a[hb]?this.valueChanged(void 0):gb in a?this.valueChanged(a[gb]):fb in a||hb in a?this.valueChanged([a[fb]]):this.valueChanged(void 0)},valueChanged:function(a){Array.isArray(a)||(a=void 0);var b=this.iteratedValue;this.unobserve(),this.iteratedValue=a,this.iteratedValue&&(this.arrayObserver=new ArrayObserver(this.iteratedValue,this.boundHandleSplices));var c=ArrayObserver.calculateSplices(this.iteratedValue||[],b||[]);c.length&&this.handleSplices(c),this.inputs.size||(Bb.delete(this),this.abandon())},getTerminatorAt:function(a){if(-1==a)return this.templateElement_;var b=this.terminators[a];if(b.nodeType!==Node.ELEMENT_NODE||this.templateElement_===b)return b;var c=Bb.get(b);return c?c.getTerminatorAt(c.terminators.length-1):b},insertInstanceAt:function(a,b){var c=this.getTerminatorAt(a-1),d=b[b.length-1]||c;this.terminators.splice(a,0,d);for(var e=this.templateElement_.parentNode,f=c.nextSibling,g=0;g<b.length;g++)e.insertBefore(b[g],f)},extractInstanceAt:function(a){var b=[],c=this.getTerminatorAt(a-1),d=this.getTerminatorAt(a);this.terminators.splice(a,1);for(var e=this.templateElement_.parentNode;d!==c;){var f=c.nextSibling;f==d&&(d=c),e.removeChild(f),b.push(f)}return b},getInstanceModel:function(a,b,c){var d=c&&c[jb];return d&&"function"==typeof d?d(a,b):b},getInstanceNodes:function(a,b,c){var d=c.get(a);if(d)return c.delete(a),d;d=[];for(var e=this.templateElement_.createInstance(a,b);e.firstChild;)d.push(e.removeChild(e.firstChild));return d},handleSplices:function(a){var b=this.templateElement_;if(!b.parentNode||!b.ownerDocument.defaultView)return this.abandon(),Bb.delete(this),void 0;var c=b.bindingDelegate,d=new X,e=0;a.forEach(function(a){a.removed.forEach(function(b){var c=this.extractInstanceAt(a.index+e,c);d.set(b,c)},this),e-=a.addedCount},this),a.forEach(function(a){for(var e=a.index;e<a.index+a.addedCount;e++){var f=this.getInstanceModel(b,this.iteratedValue[e],c),g=this.getInstanceNodes(f,c,d);this.insertInstanceAt(e,g)}},this),d.forEach(function(a){for(var b=0;b<a.length;b++)R(a[b])})},unobserve:function(){this.arrayObserver&&(this.arrayObserver.close(),this.arrayObserver=void 0)},abandon:function(){this.unobserve(),this.terminators.length=0,Object.defineProperty(this.inputs,"value",{configurable:!0,writable:!0,value:void 0}),this.inputs.dispose()}};var Bb=new _;a.CompoundBinding=V,HTMLTemplateElement.forAllTemplatesFrom_=D,HTMLTemplateElement.bindAllMustachesFrom_=Q,HTMLTemplateElement.parseAndBind_=O}(this),function(a,b){"function"==typeof define&&define.amd?define('../lib/platform.min.js',["exports"],b):"undefined"!=typeof exports?b(exports):b(a.esprima={})}(this,function(a){function b(a,b){if(!a)throw new Error("ASSERT: "+b)}function c(a){return a>=48&&57>=a}function d(a){return 32===a||9===a||11===a||12===a||160===a||a>=5760&&" ᠎             　﻿".indexOf(String.fromCharCode(a))>0}function e(a){return 10===a||13===a||8232===a||8233===a}function f(a){return 36===a||95===a||a>=65&&90>=a||a>=97&&122>=a}function g(a){return 36===a||95===a||a>=65&&90>=a||a>=97&&122>=a||a>=48&&57>=a}function h(a){return"this"===a}function i(){for(;bb>ab&&d(_.charCodeAt(ab));)++ab}function j(){var a,b;for(a=ab++;bb>ab&&(b=_.charCodeAt(ab),g(b));)++ab;return _.slice(a,ab)}function k(){var a,b,c;return a=ab,b=j(),c=1===b.length?X.Identifier:h(b)?X.Keyword:"null"===b?X.NullLiteral:"true"===b||"false"===b?X.BooleanLiteral:X.Identifier,{type:c,value:b,range:[a,ab]}}function l(){var a,b,c,d,e=ab,f=_.charCodeAt(ab),g=_[ab];switch(f){case 46:case 40:case 41:case 59:case 44:case 123:case 125:case 91:case 93:case 58:case 63:case 126:return++ab,{type:X.Punctuator,value:String.fromCharCode(f),range:[e,ab]};default:if(a=_.charCodeAt(ab+1),61===a)switch(f){case 37:case 38:case 42:case 43:case 45:case 47:case 60:case 62:case 94:case 124:return ab+=2,{type:X.Punctuator,value:String.fromCharCode(f)+String.fromCharCode(a),range:[e,ab]};case 33:case 61:return ab+=2,61===_.charCodeAt(ab)&&++ab,{type:X.Punctuator,value:_.slice(e,ab),range:[e,ab]}}}return b=_[ab+1],c=_[ab+2],d=_[ab+3],">"===g&&">"===b&&">"===c&&"="===d?(ab+=4,{type:X.Punctuator,value:">>>=",range:[e,ab]}):">"===g&&">"===b&&">"===c?(ab+=3,{type:X.Punctuator,value:">>>",range:[e,ab]}):"<"===g&&"<"===b&&"="===c?(ab+=3,{type:X.Punctuator,value:"<<=",range:[e,ab]}):">"===g&&">"===b&&"="===c?(ab+=3,{type:X.Punctuator,value:">>=",range:[e,ab]}):g===b&&"+-<>&|".indexOf(g)>=0?(ab+=2,{type:X.Punctuator,value:g+b,range:[e,ab]}):"<>=!+-*%&|^/".indexOf(g)>=0?(++ab,{type:X.Punctuator,value:g,range:[e,ab]}):(s({},$.UnexpectedToken,"ILLEGAL"),void 0)}function m(){var a,d,e;if(e=_[ab],b(c(e.charCodeAt(0))||"."===e,"Numeric literal must start with a decimal digit or a decimal point"),d=ab,a="","."!==e){for(a=_[ab++],e=_[ab],"0"===a&&e&&c(e.charCodeAt(0))&&s({},$.UnexpectedToken,"ILLEGAL");c(_.charCodeAt(ab));)a+=_[ab++];e=_[ab]}if("."===e){for(a+=_[ab++];c(_.charCodeAt(ab));)a+=_[ab++];e=_[ab]}if("e"===e||"E"===e)if(a+=_[ab++],e=_[ab],("+"===e||"-"===e)&&(a+=_[ab++]),c(_.charCodeAt(ab)))for(;c(_.charCodeAt(ab));)a+=_[ab++];else s({},$.UnexpectedToken,"ILLEGAL");return f(_.charCodeAt(ab))&&s({},$.UnexpectedToken,"ILLEGAL"),{type:X.NumericLiteral,value:parseFloat(a),range:[d,ab]}}function n(){var a,c,d,f="",g=!1;for(a=_[ab],b("'"===a||'"'===a,"String literal must starts with a quote"),c=ab,++ab;bb>ab;){if(d=_[ab++],d===a){a="";break}if("\\"===d)if(d=_[ab++],d&&e(d.charCodeAt(0)))"\r"===d&&"\n"===_[ab]&&++ab;else switch(d){case"n":f+="\n";break;case"r":f+="\r";break;case"t":f+="	";break;case"b":f+="\b";break;case"f":f+="\f";break;case"v":f+="";break;default:f+=d}else{if(e(d.charCodeAt(0)))break;f+=d}}return""!==a&&s({},$.UnexpectedToken,"ILLEGAL"),{type:X.StringLiteral,value:f,octal:g,range:[c,ab]}}function o(a){return a.type===X.Identifier||a.type===X.Keyword||a.type===X.BooleanLiteral||a.type===X.NullLiteral}function p(){var a;return i(),ab>=bb?{type:X.EOF,range:[ab,ab]}:(a=_.charCodeAt(ab),40===a||41===a||58===a?l():39===a||34===a?n():f(a)?k():46===a?c(_.charCodeAt(ab+1))?m():l():c(a)?m():l())}function q(){var a;return a=db,ab=a.range[1],db=p(),ab=a.range[1],a}function r(){var a;a=ab,db=p(),ab=a}function s(a,c){var d,e=Array.prototype.slice.call(arguments,2),f=c.replace(/%(\d)/g,function(a,c){return b(c<e.length,"Message reference must be in range"),e[c]});throw d=new Error(f),d.index=ab,d.description=f,d}function t(a){s(a,$.UnexpectedToken,a.value)}function u(a){var b=q();(b.type!==X.Punctuator||b.value!==a)&&t(b)}function v(a){return db.type===X.Punctuator&&db.value===a}function w(a){return db.type===X.Keyword&&db.value===a}function x(){return 59===_.charCodeAt(ab)?(q(),void 0):(i(),v(";")?(q(),void 0):(db.type===X.EOF||v("}")||t(db),void 0))}function y(){var a=[];for(u("[");!v("]");)v(",")?(q(),a.push(null)):(a.push(O()),v("]")||u(","));return u("]"),cb.createArrayExpression(a)}function z(){var a;return i(),a=q(),a.type===X.StringLiteral||a.type===X.NumericLiteral?cb.createLiteral(a):cb.createIdentifier(a.value)}function A(){var a,b;return a=db,i(),(a.type===X.EOF||a.type===X.Punctuator)&&t(a),b=z(),u(":"),cb.createProperty("init",b,O())}function B(){var a=[];for(u("{");!v("}");)a.push(A()),v("}")||u(",");return u("}"),cb.createObjectExpression(a)}function C(){var a;return u("("),a=P(),u(")"),a}function D(){var a,b,c;return v("(")?C():(a=db.type,a===X.Identifier?c=cb.createIdentifier(q().value):a===X.StringLiteral||a===X.NumericLiteral?c=cb.createLiteral(q()):a===X.Keyword?w("this")&&(q(),c=cb.createThisExpression()):a===X.BooleanLiteral?(b=q(),b.value="true"===b.value,c=cb.createLiteral(b)):a===X.NullLiteral?(b=q(),b.value=null,c=cb.createLiteral(b)):v("[")?c=y():v("{")&&(c=B()),c?c:(t(q()),void 0))}function E(){var a=[];if(u("("),!v(")"))for(;bb>ab&&(a.push(O()),!v(")"));)u(",");return u(")"),a}function F(){var a;return a=q(),o(a)||t(a),cb.createIdentifier(a.value)}function G(){return u("."),F()}function H(){var a;return u("["),a=P(),u("]"),a}function I(){var a,b,c;for(a=D();v(".")||v("[")||v("(");)v("(")?(b=E(),a=cb.createCallExpression(a,b)):v("[")?(c=H(),a=cb.createMemberExpression("[",a,c)):(c=G(),a=cb.createMemberExpression(".",a,c));return a}function J(){var a;return a=I(),db.type===X.Punctuator&&(v("++")||v("--"))&&s({},$.UnexpectedToken),a}function K(){var a,b;return db.type!==X.Punctuator&&db.type!==X.Keyword?b=J():v("++")||v("--")?s({},$.UnexpectedToken):v("+")||v("-")||v("~")||v("!")?(a=q(),b=K(),b=cb.createUnaryExpression(a.value,b)):w("delete")||w("void")||w("typeof")?s({},$.UnexpectedToken):b=J(),b}function L(a,b){var c=0;if(a.type!==X.Punctuator&&a.type!==X.Keyword)return 0;switch(a.value){case"||":c=1;break;case"&&":c=2;break;case"|":c=3;break;case"^":c=4;break;case"&":c=5;break;case"==":case"!=":case"===":case"!==":c=6;break;case"<":case">":case"<=":case">=":case"instanceof":c=7;break;case"in":c=b?7:0;break;case"<<":case">>":case">>>":c=8;break;case"+":case"-":c=9;break;case"*":case"/":case"%":c=11}return c}function M(){var a,b,c,d,e,f,g,h,i;if(d=eb.allowIn,eb.allowIn=!0,h=K(),b=db,c=L(b,d),0===c)return h;for(b.prec=c,q(),f=K(),e=[h,b,f];(c=L(db,d))>0;){for(;e.length>2&&c<=e[e.length-2].prec;)f=e.pop(),g=e.pop().value,h=e.pop(),a=cb.createBinaryExpression(g,h,f),e.push(a);b=q(),b.prec=c,e.push(b),a=K(),e.push(a)}for(eb.allowIn=d,i=e.length-1,a=e[i];i>1;)a=cb.createBinaryExpression(e[i-1].value,e[i-2],a),i-=2;return a}function N(){var a,b,c,d;return a=M(),v("?")&&(q(),b=eb.allowIn,eb.allowIn=!0,c=O(),eb.allowIn=b,u(":"),d=O(),a=cb.createConditionalExpression(a,c,d)),a}function O(){var a,b,c;return a=db,c=b=N()}function P(){var a;return a=O()}function Q(){return u(";"),cb.createEmptyStatement()}function R(){var a=P();return x(),cb.createExpressionStatement(a)}function S(){var a,b,c,d=db.type;if(d===X.EOF&&t(db),i(),d===X.Punctuator)switch(db.value){case";":return Q();case"(":return R()}return a=P(),a.type===Z.Identifier&&v(":")?(q(),c="$"+a.name,Object.prototype.hasOwnProperty.call(eb.labelSet,c)&&s({},$.Redeclaration,"Label",a.name),eb.labelSet[c]=!0,b=S(),delete eb.labelSet[c],cb.createLabeledStatement(a,b)):(x(),cb.createExpressionStatement(a))}function T(){return db.type===X.Keyword?S():db.type!==X.EOF?S():void 0}function U(){for(var a,b=[];bb>ab&&(a=T(),"undefined"!=typeof a);)b.push(a);return b}function V(){var a;return i(),r(),a=U(),cb.createProgram(a)}function W(a,b){var c;return c=String,"string"==typeof a||a instanceof String||(a=c(a)),cb=b,_=a,ab=0,bb=_.length,db=null,eb={allowIn:!0,labelSet:{}},bb>0&&"undefined"==typeof _[0]&&a instanceof String&&(_=a.valueOf()),V()}var X,Y,Z,$,_,ab,bb,cb,db,eb;X={BooleanLiteral:1,EOF:2,Identifier:3,Keyword:4,NullLiteral:5,NumericLiteral:6,Punctuator:7,StringLiteral:8},Y={},Y[X.BooleanLiteral]="Boolean",Y[X.EOF]="<end>",Y[X.Identifier]="Identifier",Y[X.Keyword]="Keyword",Y[X.NullLiteral]="Null",Y[X.NumericLiteral]="Numeric",Y[X.Punctuator]="Punctuator",Y[X.StringLiteral]="String",Z={ArrayExpression:"ArrayExpression",BinaryExpression:"BinaryExpression",CallExpression:"CallExpression",ConditionalExpression:"ConditionalExpression",EmptyStatement:"EmptyStatement",ExpressionStatement:"ExpressionStatement",Identifier:"Identifier",Literal:"Literal",LabeledStatement:"LabeledStatement",LogicalExpression:"LogicalExpression",MemberExpression:"MemberExpression",ObjectExpression:"ObjectExpression",Program:"Program",Property:"Property",ThisExpression:"ThisExpression",UnaryExpression:"UnaryExpression"},$={UnexpectedToken:"Unexpected token %0",UnknownLabel:"Undefined label '%0'",Redeclaration:"%0 '%1' has already been declared"},a.parse=W}),function(a){function b(a,b,d,e){if(e.nodeType===Node.ELEMENT_NODE&&"TEMPLATE"===e.tagName&&("bind"===d||"repeat"===d)){var f,g,h=b.match(r);if(h?(f=h[1],g=h[2]):(h=b.match(s),h&&(f=h[2],g=h[1])),h){var i;if(g=g.trim(),g.match(q))i=new CompoundBinding(function(a){return a.path}),i.bind("path",a,g);else try{i=c(a,g)}catch(j){console.error("Invalid expression syntax: "+g,j)}if(i)return t.set(e,f),i}}}function c(a,b){try{var c=new f;if(esprima.parse(b,c),!c.statements.length&&!c.labeledStatements.length)return;if(!c.labeledStatements.length&&c.statements.length>1)throw Error("Multiple unlabelled statements are not allowed.");var e=c.labeledStatements.length?d(c.labeledStatements):e=c.statements[0],g=[];for(var h in c.deps)g.push(h);if(!g.length)return{value:e({})};for(var i=new CompoundBinding(e),j=0;j<g.length;j++)i.bind(g[j],a,g[j]);return i}catch(k){console.error("Invalid expression syntax: "+b,k)}}function d(a){return function(b){for(var c=[],d=0;d<a.length;d++)a[d].body(b)&&c.push(a[d].label);return c.join(" ")}}function e(a,b,c){this.deps=a,this.name=b,this.last=c}function f(){this.statements=[],this.labeledStatements=[],this.deps={},this.currentPath=void 0}function g(){throw Error("Not Implemented")}function h(){}var i;"undefined"!=typeof WeakMap&&navigator.userAgent.indexOf("Firefox/")<0?i=WeakMap:function(){var a=Object.defineProperty,b=Object.hasOwnProperty,c=(new Date).getTime()%1e9;i=function(){this.name="__st"+(1e9*Math.random()>>>0)+(c++ +"__")},i.prototype={set:function(b,c){a(b,this.name,{value:c,writable:!0})},get:function(a){return b.call(a,this.name)?a[this.name]:void 0},"delete":function(a){this.set(a,void 0)}}}();var j="[$_a-zA-Z]",k="[$_a-zA-Z0-9]",l=j+"+"+k+"*",m="("+l+")",n="(?:[0-9]|[1-9]+[0-9]+)",o="(?:"+l+"|"+n+")",p="(?:"+o+")(?:\\."+o+")*",q=new RegExp("^"+p+"$"),r=new RegExp("^"+m+"\\s* in (.*)$"),s=new RegExp("^(.*) as \\s*"+m+"$"),t=new i;e.prototype={getPath:function(){return this.last?this.last.getPath()+"."+this.name:this.name},valueFn:function(){var a=this.getPath();return this.deps[a]=!0,function(b){return b[a]}}};var u={"+":function(a){return+a},"-":function(a){return-a},"!":function(a){return!a}},v={"+":function(a,b){return a+b},"-":function(a,b){return a-b},"*":function(a,b){return a*b},"/":function(a,b){return a/b},"%":function(a,b){return a%b},"<":function(a,b){return b>a},">":function(a,b){return a>b},"<=":function(a,b){return b>=a},">=":function(a,b){return a>=b},"==":function(a,b){return a==b},"!=":function(a,b){return a!=b},"===":function(a,b){return a===b},"!==":function(a,b){return a!==b},"&&":function(a,b){return a&&b},"||":function(a,b){return a||b}};f.prototype={getFn:function(a){return a instanceof e?a.valueFn():a},createProgram:function(){},createExpressionStatement:function(a){return this.statements.push(a),a},createLabeledStatement:function(a,b){return this.labeledStatements.push({label:a.getPath(),body:b instanceof e?b.valueFn():b}),b},createUnaryExpression:function(a,b){if(!u[a])throw Error("Disallowed operator: "+a);return b=this.getFn(b),function(c){return u[a](b(c))}},createBinaryExpression:function(a,b,c){if(!v[a])throw Error("Disallowed operator: "+a);return b=this.getFn(b),c=this.getFn(c),function(d){return v[a](b(d),c(d))}},createConditionalExpression:function(a,b,c){return a=this.getFn(a),b=this.getFn(b),c=this.getFn(c),function(d){return a(d)?b(d):c(d)}},createIdentifier:function(a){var b=new e(this.deps,a);return b.type="Identifier",b},createMemberExpression:function(a,b,c){return new e(this.deps,c.name,b)},createLiteral:function(a){return function(){return a.value}},createArrayExpression:function(a){for(var b=0;b<a.length;b++)a[b]=this.getFn(a[b]);return function(b){for(var c=[],d=0;d<a.length;d++)c.push(a[d](b));return c}},createProperty:function(a,b,c){return{key:b instanceof e?b.getPath():b(),value:c}},createObjectExpression:function(a){for(var b=0;b<a.length;b++)a[b].value=this.getFn(a[b].value);return function(b){for(var c={},d=0;d<a.length;d++)c[a[d].key]=a[d].value(b);return c}},createCallExpression:g,createEmptyStatement:g,createThisExpression:g},h.prototype={getBinding:function(a,d,e,f){return d=d.trim(),d&&!d.match(q)?b(a,d,e,f)||c(a,d,e,f):void 0},getInstanceModel:function(a,b){var c=t.get(a);if(!c)return b;var d=a.templateInstance?a.templateInstance.model:a.model,e=Object.create(d);return e[c]=b,e}},a.ExpressionSyntax=h}(this),function(a){function b(){logFlags.data&&console.group("Model.dirtyCheck()"),c(),logFlags.data&&console.groupEnd()}function c(){Platform.performMicrotaskCheckpoint()}var d=document.createElement("style");d.textContent="template {display: none;} /* injected by platform.js */";var e=document.querySelector("head");e.insertBefore(d,e.firstChild),HTMLTemplateElement.__instanceCreated=function(a){document.adoptNode(a),CustomElements.upgradeAll(a)};var f=125;window.addEventListener("WebComponentsReady",function(){b(),Observer.hasObjectObserve||setInterval(c,f)}),a.flush=b,window.dirtyCheck=b}(window.Platform),function(a){function b(a){return d(a,i)}function c(a){return d(a,j)}function d(a,b){return"link"===a.localName&&a.getAttribute("rel")===b}function e(a){return"script"===a.localName}function f(a,b){var c=document.implementation.createHTMLDocument(i);c._URL=b;var d=c.createElement("base");return d.setAttribute("href",document.baseURI),c.head.appendChild(d),c.body.innerHTML=a,window.HTMLTemplateElement&&HTMLTemplateElement.bootstrap&&HTMLTemplateElement.bootstrap(c),c}a||(a=window.HTMLImports={flags:{}});var g,h=a.xhr,i="import",j="stylesheet",k={documents:{},cache:{},preloadSelectors:["link[rel="+i+"]","element link[rel="+j+"]","template","script[src]"].join(","),loader:function(a){return g=new l(k.loaded,a),g.cache=k.cache,g},load:function(a,b){g=k.loader(b),k.preload(a)},preload:function(a){var b=a.querySelectorAll(k.preloadSelectors);b=this.filterMainDocumentNodes(a,b),b=this.extractTemplateNodes(b),g.addNodes(b)},filterMainDocumentNodes:function(a,b){return a===document&&(b=Array.prototype.filter.call(b,function(a){return!e(a)})),b},extractTemplateNodes:function(a){var b=[];return a=Array.prototype.filter.call(a,function(a){if("template"===a.localName){if(a.content){var c=a.content.querySelectorAll("link[rel="+j+"]");c.length&&(b=b.concat(Array.prototype.slice.call(c,0)))}return!1}return!0}),b.length&&(a=a.concat(b)),a},loaded:function(a,d,e){if(b(d)){var g=k.documents[a];g||(g=f(e,a),p.resolvePathsInHTML(g.body),k.documents[a]=g,k.preload(g)),d.import={href:a,ownerNode:d,content:g},d.content=e=g}d.__resource=e,c(d)&&p.resolvePathsInStylesheet(d)}},l=function(a,b){this.onload=a,this.oncomplete=b,this.inflight=0,this.pending={},this.cache={}};l.prototype={addNodes:function(a){this.inflight+=a.length,q(a,this.require,this),this.checkDone()},require:function(a){var b=p.nodeUrl(a);a.__nodeUrl=b,this.dedupe(b,a)||this.fetch(b,a)},dedupe:function(a,b){return this.pending[a]?(this.pending[a].push(b),!0):this.cache[a]?(this.onload(a,b,g.cache[a]),this.tail(),!0):(this.pending[a]=[b],!1)},fetch:function(a,b){var c=function(c,d){this.receive(a,b,c,d)}.bind(this);h.load(a,c)},receive:function(a,b,c,d){c||(g.cache[a]=d),g.pending[a].forEach(function(b){c||this.onload(a,b,d),this.tail()},this),g.pending[a]=null},tail:function(){--this.inflight,this.checkDone()},checkDone:function(){this.inflight||this.oncomplete()}};var m=["href","src","action"],n="["+m.join("],[")+"]",o="{{.*}}",p={nodeUrl:function(a){return p.resolveUrl(p.getDocumentUrl(document),p.hrefOrSrc(a))},hrefOrSrc:function(a){return a.getAttribute("href")||a.getAttribute("src")},documentUrlFromNode:function(a){return p.getDocumentUrl(a.ownerDocument)},getDocumentUrl:function(a){var b=a&&(a._URL||a.impl&&a.impl._URL||a.baseURI||a.URL)||"";return b.split("#")[0]},resolveUrl:function(a,b,c){if(this.isAbsUrl(b))return b;var d=this.compressUrl(this.urlToPath(a)+b);return c&&(d=p.makeRelPath(p.getDocumentUrl(document),d)),d},isAbsUrl:function(a){return/(^data:)|(^http[s]?:)|(^\/)/.test(a)},urlToPath:function(a){var b=a.split("/");return b.pop(),b.push(""),b.join("/")},compressUrl:function(a){for(var b,c=a.split("/"),d=0;d<c.length;d++)b=c[d],".."===b&&(c.splice(d-1,2),d-=2);return c.join("/")},makeRelPath:function(a,b){var c,d;for(c=this.compressUrl(a).split("/"),d=this.compressUrl(b).split("/");c.length&&c[0]===d[0];)c.shift(),d.shift();for(var e=0,f=c.length-1;f>e;e++)d.unshift("..");var g=d.join("/");return g},resolvePathsInHTML:function(a,b){b=b||p.documentUrlFromNode(a),p.resolveAttributes(a,b),p.resolveStyleElts(a,b);var c=a.querySelectorAll("template");c&&q(c,function(a){a.content&&p.resolvePathsInHTML(a.content,b)})},resolvePathsInStylesheet:function(a){var b=p.nodeUrl(a);a.__resource=p.resolveCssText(a.__resource,b)},resolveStyleElts:function(a,b){var c=a.querySelectorAll("style");c&&q(c,function(a){a.textContent=p.resolveCssText(a.textContent,b)})},resolveCssText:function(a,b){return a.replace(/url\([^)]*\)/g,function(a){var c=a.replace(/["']/g,"").slice(4,-1);return c=p.resolveUrl(b,c,!0),"url("+c+")"})},resolveAttributes:function(a,b){var c=a&&a.querySelectorAll(n);c&&q(c,function(a){this.resolveNodeAttributes(a,b)},this)},resolveNodeAttributes:function(a,b){m.forEach(function(c){var d=a.attributes[c];if(d&&d.value&&d.value.search(o)<0){var e=p.resolveUrl(b,d.value,!0);d.value=e}})}};h=h||{async:!0,ok:function(a){return a.status>=200&&a.status<300||304===a.status||0===a.status},load:function(b,c,d){var e=new XMLHttpRequest;(a.flags.debug||a.flags.bust)&&(b+="?"+Math.random()),e.open("GET",b,h.async),e.addEventListener("readystatechange",function(){4===e.readyState&&c.call(d,!h.ok(e)&&e,e.response,b)}),e.send()}};var q=Array.prototype.forEach.call.bind(Array.prototype.forEach);a.xhr=h,a.importer=k,a.getDocumentUrl=p.getDocumentUrl,a.IMPORT_LINK_TYPE=i}(window.HTMLImports),function(a){function b(a){return"link"===a.localName&&a.getAttribute("rel")===f}function c(a){return a.parentNode&&!d(a)&&!e(a)}function d(a){return a.ownerDocument===document||a.ownerDocument.impl===document}function e(a){return a.parentNode&&"element"===a.parentNode.localName}var f="import",g={selectors:["link[rel="+f+"]","link[rel=stylesheet]","style","script"],map:{link:"parseLink",script:"parseScript",style:"parseGeneric"},parse:function(a){if(!a.__importParsed){a.__importParsed=!0;var b=a.querySelectorAll(g.selectors);h(b,function(a){g[g.map[a.localName]](a)})}},parseLink:function(a){b(a)?a.content&&g.parse(a.content):this.parseGeneric(a)},parseGeneric:function(a){c(a)&&document.head.appendChild(a)},parseScript:function(a){if(c(a)){var b=a.__resource||a.textContent;b&&(b+="\n//# sourceURL="+(a.__nodeUrl||"inline["+Math.floor(1e3*(Math.random()+1))+"]")+"\n",eval.call(window,b))}}},h=Array.prototype.forEach.call.bind(Array.prototype.forEach);a.parser=g}(HTMLImports),function(){function a(){HTMLImports.importer.load(document,function(){HTMLImports.parser.parse(document),HTMLImports.readyTime=(new Date).getTime(),document.dispatchEvent(new CustomEvent("HTMLImportsLoaded",{bubbles:!0}))})}"function"!=typeof window.CustomEvent&&(window.CustomEvent=function(a){var b=document.createEvent("HTMLEvents");return b.initEvent(a,!0,!0),b}),"complete"===document.readyState||"interactive"===document.readyState?a():window.addEventListener("DOMContentLoaded",a)}(),function(a){function b(a){u.push(a),t||(t=!0,q(d))}function c(a){return window.ShadowDOMPolyfill&&window.ShadowDOMPolyfill.wrapIfNeeded(a)||a}function d(){t=!1;var a=u;u=[],a.sort(function(a,b){return a.uid_-b.uid_});var b=!1;a.forEach(function(a){var c=a.takeRecords();e(a),c.length&&(a.callback_(c,a),b=!0)}),b&&d()}function e(a){a.nodes_.forEach(function(b){var c=p.get(b);c&&c.forEach(function(b){b.observer===a&&b.removeTransientObservers()})})}function f(a,b){for(var c=a;c;c=c.parentNode){var d=p.get(c);if(d)for(var e=0;e<d.length;e++){var f=d[e],g=f.options;if(c===a||g.subtree){var h=b(g);h&&f.enqueue(h)}}}}function g(a){this.callback_=a,this.nodes_=[],this.records_=[],this.uid_=++v}function h(a,b){this.type=a,this.target=b,this.addedNodes=[],this.removedNodes=[],this.previousSibling=null,this.nextSibling=null,this.attributeName=null,this.attributeNamespace=null,this.oldValue=null}function i(a){var b=new h(a.type,a.target);return b.addedNodes=a.addedNodes.slice(),b.removedNodes=a.removedNodes.slice(),b.previousSibling=a.previousSibling,b.nextSibling=a.nextSibling,b.attributeName=a.attributeName,b.attributeNamespace=a.attributeNamespace,b.oldValue=a.oldValue,b}function j(a,b){return w=new h(a,b)}function k(a){return x?x:(x=i(w),x.oldValue=a,x)}function l(){w=x=void 0}function m(a){return a===x||a===w}function n(a,b){return a===b?a:x&&m(a)?x:null}function o(a,b,c){this.observer=a,this.target=b,this.options=c,this.transientObservedNodes=[]}var p=new SideTable,q=window.msSetImmediate;if(!q){var r=[],s=String(Math.random());window.addEventListener("message",function(a){if(a.data===s){var b=r;r=[],b.forEach(function(a){a()})}}),q=function(a){r.push(a),window.postMessage(s,"*")}}var t=!1,u=[],v=0;g.prototype={observe:function(a,b){if(a=c(a),!b.childList&&!b.attributes&&!b.characterData||b.attributeOldValue&&!b.attributes||b.attributeFilter&&b.attributeFilter.length&&!b.attributes||b.characterDataOldValue&&!b.characterData)throw new SyntaxError;var d=p.get(a);d||p.set(a,d=[]);for(var e,f=0;f<d.length;f++)if(d[f].observer===this){e=d[f],e.removeListeners(),e.options=b;break}e||(e=new o(this,a,b),d.push(e),this.nodes_.push(a)),e.addListeners()},disconnect:function(){this.nodes_.forEach(function(a){for(var b=p.get(a),c=0;c<b.length;c++){var d=b[c];if(d.observer===this){d.removeListeners(),b.splice(c,1);break}}},this),this.records_=[]},takeRecords:function(){var a=this.records_;return this.records_=[],a}};var w,x;o.prototype={enqueue:function(a){var c=this.observer.records_,d=c.length;if(c.length>0){var e=c[d-1],f=n(e,a);if(f)return c[d-1]=f,void 0}else b(this.observer);c[d]=a},addListeners:function(){this.addListeners_(this.target)},addListeners_:function(a){var b=this.options;b.attributes&&a.addEventListener("DOMAttrModified",this,!0),b.characterData&&a.addEventListener("DOMCharacterDataModified",this,!0),b.childList&&a.addEventListener("DOMNodeInserted",this,!0),(b.childList||b.subtree)&&a.addEventListener("DOMNodeRemoved",this,!0)},removeListeners:function(){this.removeListeners_(this.target)},removeListeners_:function(a){var b=this.options;b.attributes&&a.removeEventListener("DOMAttrModified",this,!0),b.characterData&&a.removeEventListener("DOMCharacterDataModified",this,!0),b.childList&&a.removeEventListener("DOMNodeInserted",this,!0),(b.childList||b.subtree)&&a.removeEventListener("DOMNodeRemoved",this,!0)},addTransientObserver:function(a){if(a!==this.target){this.addListeners_(a),this.transientObservedNodes.push(a);var b=p.get(a);b||p.set(a,b=[]),b.push(this)}},removeTransientObservers:function(){var a=this.transientObservedNodes;this.transientObservedNodes=[],a.forEach(function(a){this.removeListeners_(a);for(var b=p.get(a),c=0;c<b.length;c++)if(b[c]===this){b.splice(c,1);break}},this)},handleEvent:function(a){switch(a.stopImmediatePropagation(),a.type){case"DOMAttrModified":var b=a.attrName,c=a.relatedNode.namespaceURI,d=a.target,e=new j("attributes",d);e.attributeName=b,e.attributeNamespace=c;var g=a.attrChange===MutationEvent.ADDITION?null:a.prevValue;f(d,function(a){return!a.attributes||a.attributeFilter&&a.attributeFilter.length&&-1===a.attributeFilter.indexOf(b)&&-1===a.attributeFilter.indexOf(c)?void 0:a.attributeOldValue?k(g):e});break;case"DOMCharacterDataModified":var d=a.target,e=j("characterData",d),g=a.prevValue;f(d,function(a){return a.characterData?a.characterDataOldValue?k(g):e:void 0});break;case"DOMNodeRemoved":this.addTransientObserver(a.target);case"DOMNodeInserted":var h,i,d=a.relatedNode,m=a.target;"DOMNodeInserted"===a.type?(h=[m],i=[]):(h=[],i=[m]);var n=m.previousSibling,o=m.nextSibling,e=j("childList",d);e.addedNodes=h,e.removedNodes=i,e.previousSibling=n,e.nextSibling=o,f(d,function(a){return a.childList?e:void 0})}l()}},a.JsMutationObserver=g}(this),!window.MutationObserver&&(window.MutationObserver=window.WebKitMutationObserver||window.JsMutationObserver,!MutationObserver))throw new Error("no mutation observer support");!function(a){function b(b,f){var g=f||{};if(!b)throw new Error("Name argument must not be empty");if(g.name=b,!g.prototype)throw new Error("Options missing required prototype property");return g.lifecycle=g.lifecycle||{},g.ancestry=c(g.extends),d(g),e(g),k(g.prototype),m(b,g),g.ctor=n(g),g.ctor.prototype=g.prototype,g.prototype.constructor=g.ctor,a.ready&&a.upgradeAll(document),g.ctor}function c(a){var b=s[a];return b?c(b.extends).concat([b]):[]}function d(a){for(var b,c=a.extends,d=0;b=a.ancestry[d];d++)c=b.is&&b.tag;a.tag=c||a.name,c&&(a.is=a.name)}function e(a){if(!Object.__proto__){var b=HTMLElement.prototype;if(a.is){var c=document.createElement(a.tag);b=Object.getPrototypeOf(c)}}a.native=b}function f(a){return g(t(a.tag),a)}function g(b,c){return c.is&&b.setAttribute("is",c.is),h(b,c),b.__upgraded__=!0,a.upgradeSubtree(b),j(b),b}function h(a,b){Object.__proto__?a.__proto__=b.prototype:(i(a,b.prototype,b.native),a.__proto__=b.prototype)}function i(a,b,c){for(var d={},e=b;e!==c&&e!==HTMLUnknownElement.prototype;){for(var f,g=Object.getOwnPropertyNames(e),h=0;f=g[h];h++)d[f]||(Object.defineProperty(a,f,Object.getOwnPropertyDescriptor(e,f)),d[f]=1);e=Object.getPrototypeOf(e)}}function j(a){a.readyCallback&&a.readyCallback()}function k(a){var b=a.setAttribute;a.setAttribute=function(a,c){l.call(this,a,c,b)};var c=a.removeAttribute;a.removeAttribute=function(a,b){l.call(this,a,b,c)}}function l(a,b,c){var d=this.getAttribute(a);c.apply(this,arguments),this.attributeChangedCallback&&this.getAttribute(a)!==d&&this.attributeChangedCallback(a,d)}function m(a,b){s[a]=b}function n(a){return function(){return f(a)}}function o(a){var b=s[a];return b?new b.ctor:t(a)}function p(a){if(!a.__upgraded__&&a.nodeType===Node.ELEMENT_NODE){var b=a.getAttribute("is")||a.localName,c=s[b];return c&&g(a,c)}}function q(b){var c=u.call(this,b);
return a.upgradeAll(c),c}if(a||(a=window.CustomElements={flags:{}}),a.hasNative=(document.webkitRegister||document.register)&&"native"===a.flags.register,a.hasNative){document.register=document.register||document.webkitRegister;var r=function(){};a.registry={},a.upgradeElement=r}else{var s={},t=document.createElement.bind(document),u=Node.prototype.cloneNode;document.register=b,document.createElement=o,Node.prototype.cloneNode=q,a.registry=s,a.upgrade=p}}(window.CustomElements),function(a){function b(a,c,d){var e=a.firstElementChild;if(!e)for(e=a.firstChild;e&&e.nodeType!==Node.ELEMENT_NODE;)e=e.nextSibling;for(;e;)c(e,d)!==!0&&b(e,c,d),e=e.nextElementSibling;return null}function c(a,d){b(a,function(a){return d(a)?!0:(a.webkitShadowRoot&&c(a.webkitShadowRoot,d),void 0)}),a.webkitShadowRoot&&c(a.webkitShadowRoot,d)}function d(a){return g(a)?(h(a),!0):(i(a),void 0)}function e(a){c(a,function(a){return d(a)?!0:void 0})}function f(a){return d(a)||e(a)}function g(b){if(!b.__upgraded__&&b.nodeType===Node.ELEMENT_NODE){var c=b.getAttribute("is")||b.localName,d=a.registry[c];if(d)return logFlags.dom&&console.group("upgrade:",b.localName),a.upgrade(b),logFlags.dom&&console.groupEnd(),!0}}function h(a){i(a),l(a)&&c(a,function(a){i(a)})}function i(a){(a.insertedCallback||a.__upgraded__&&logFlags.dom)&&(logFlags.dom&&console.group("inserted:",a.localName),l(a)&&(a.__inserted=(a.__inserted||0)+1,a.__inserted<1&&(a.__inserted=1),a.__inserted>1?logFlags.dom&&console.warn("inserted:",a.localName,"insert/remove count:",a.__inserted):a.insertedCallback&&(logFlags.dom&&console.log("inserted:",a.localName),a.insertedCallback())),logFlags.dom&&console.groupEnd())}function j(a){k(a),c(a,function(a){k(a)})}function k(a){(a.removedCallback||a.__upgraded__&&logFlags.dom)&&(logFlags.dom&&console.log("removed:",a.localName),l(a)||(a.__inserted=(a.__inserted||0)-1,a.__inserted>0&&(a.__inserted=0),a.__inserted<0?logFlags.dom&&console.warn("removed:",a.localName,"insert/remove count:",a.__inserted):a.removedCallback&&a.removedCallback()))}function l(a){for(var b=a;b;){if(b==a.ownerDocument)return!0;b=b.parentNode||b.host}}function m(a){a.webkitShadowRoot&&!a.webkitShadowRoot.__watched&&(logFlags.dom&&console.log("watching shadow-root for: ",a.localName),r(a.webkitShadowRoot),a.webkitShadowRoot.__watched=!0)}function n(a){m(a),c(a,function(){m(a)})}function o(a){switch(a.localName){case"style":case"script":case"template":case void 0:return!0}}function p(a){if(logFlags.dom){var b=a[0];if(b&&"childList"===b.type&&b.addedNodes&&b.addedNodes){for(var c=b.addedNodes[0];c&&c!==document&&!c.host;)c=c.parentNode;var d=c&&(c.URL||c._URL||c.host&&c.host.localName)||"";d=d.split("/?").shift().split("/").pop()}console.group("mutations (%d) [%s]",a.length,d||"")}a.forEach(function(a){"childList"===a.type&&(v(a.addedNodes,function(a){o(a)||f(a)}),v(a.removedNodes,function(a){o(a)||j(a)}))}),logFlags.dom&&console.groupEnd()}function q(){p(u.takeRecords())}function r(a){u.observe(a,{childList:!0,subtree:!0})}function s(a){r(a)}function t(a){logFlags.dom&&console.group("upgradeDocument: ",(a.URL||a._URL||"").split("/").pop()),f(a),logFlags.dom&&console.groupEnd()}var u=new MutationObserver(p),v=Array.prototype.forEach.call.bind(Array.prototype.forEach);a.watchShadow=m,a.watchAllShadows=n,a.upgradeAll=f,a.upgradeSubtree=e,a.observeDocument=s,a.upgradeDocument=t,a.takeRecords=q}(window.CustomElements),function(){function parseElementElement(a){var b={name:"","extends":null};takeAttributes(a,b);var c=HTMLElement.prototype;if(b.extends){var d=document.createElement(b.extends);c=d.__proto__||Object.getPrototypeOf(d)}b.prototype=Object.create(c),a.options=b;var e=a.querySelector("script,scripts");e&&executeComponentScript(e.textContent,a,b.name);var f=document.register(b.name,b);a.ctor=f;var g=a.getAttribute("constructor");g&&(window[g]=f)}function takeAttributes(a,b){for(var c in b){var d=a.attributes[c];d&&(b[c]=d.value)}}function executeComponentScript(inScript,inContext,inName){context=inContext;var owner=context.ownerDocument,url=owner._URL||owner.URL||owner.impl&&(owner.impl._URL||owner.impl.URL),match=url.match(/.*\/([^.]*)[.]?.*$/);if(match){var name=match[1];url+=name!=inName?":"+inName:""}var code="__componentScript('"+inName+"', function(){"+inScript+"});"+"\n//# sourceURL="+url+"\n";eval(code)}function mixin(a,b){a=a||{};try{Object.getOwnPropertyNames(b).forEach(function(c){var d=Object.getOwnPropertyDescriptor(b,c);d&&Object.defineProperty(a,c,d)})}catch(c){}return a}var HTMLElementElement=function(a){return a.register=HTMLElementElement.prototype.register,parseElementElement(a),a};HTMLElementElement.prototype={register:function(a){a&&(this.options.lifecycle=a.lifecycle,a.prototype&&mixin(this.options.prototype,a.prototype))}};var context;window.__componentScript=function(a,b){b.call(context)},window.HTMLElementElement=HTMLElementElement}(),function(){function a(a){return"link"===a.localName&&a.getAttribute("rel")===b}var b=window.HTMLImports?HTMLImports.IMPORT_LINK_TYPE:"none",c={selectors:["link[rel="+b+"]","element"],map:{link:"parseLink",element:"parseElement"},parse:function(a){if(!a.__parsed){a.__parsed=!0;var b=a.querySelectorAll(c.selectors);d(b,function(a){c[c.map[a.localName]](a)}),CustomElements.upgradeDocument(a),CustomElements.observeDocument(a)}},parseLink:function(b){a(b)&&this.parseImport(b)},parseImport:function(a){a.content&&c.parse(a.content)},parseElement:function(a){new HTMLElementElement(a)}},d=Array.prototype.forEach.call.bind(Array.prototype.forEach);CustomElements.parser=c}(),function(){function a(){setTimeout(function(){CustomElements.parser.parse(document),CustomElements.upgradeDocument(document),CustomElements.ready=!0,CustomElements.readyTime=(new Date).getTime(),window.HTMLImports&&(CustomElements.elapsed=CustomElements.readyTime-HTMLImports.readyTime),document.body.dispatchEvent(new CustomEvent("WebComponentsReady",{bubbles:!0}))},0)}if("function"!=typeof window.CustomEvent&&(window.CustomEvent=function(a){var b=document.createEvent("HTMLEvents");return b.initEvent(a,!0,!0),b}),"complete"===document.readyState)a();else{var b=window.HTMLImports?"HTMLImportsLoaded":"DOMContentLoaded";window.addEventListener(b,a)}}(),function(){function a(){}var b=document.createElement("style");b.textContent="element {display: none;} /* injected by platform.js */";var c=document.querySelector("head");if(c.insertBefore(b,c.firstChild),window.ShadowDOMPolyfill){CustomElements.watchShadow=a,CustomElements.watchAllShadows=a;var d=["upgradeAll","upgradeSubtree","observeDocument","upgradeDocument"],e={};d.forEach(function(a){e[a]=CustomElements[a]}),d.forEach(function(a){CustomElements[a]=function(b){return e[a](wrap(b))}})}}(),function(a){a=a||{};var b={shadow:function(a){return a?a.shadowRoot||a.webkitShadowRoot:void 0},canTarget:function(a){return a&&Boolean(a.elementFromPoint)},targetingShadow:function(a){var b=this.shadow(a);return this.canTarget(b)?b:void 0},searchRoot:function(a,b,c){if(a){var d,e,f,g=a.elementFromPoint(b,c);for(e=this.targetingShadow(g);e;){if(d=e.elementFromPoint(b,c)){var h=this.targetingShadow(d);return this.searchRoot(h,b,c)||d}f=e.querySelector("shadow"),e=f&&f.olderShadowRoot}return g}},findTarget:function(a){var b=a.clientX,c=a.clientY;return this.searchRoot(document,b,c)}};a.targetFinding=b,a.findTarget=b.findTarget.bind(b),window.PointerEventsPolyfill=a}(window.PointerEventsPolyfill),function(){function a(a){return'[touch-action="'+a+'"]'}function b(a){return"{ -ms-touch-action: "+a+"; touch-action: "+a+"; }"}var c=["none","pan-x","pan-y",{rule:"pan-x pan-y",selectors:["scroll","pan-x pan-y","pan-y pan-x"]}],d="";c.forEach(function(c){d+=String(c)===c?a(c)+b(c):c.selectors.map(a)+b(c.rule)});var e=document.createElement("style");e.textContent=d;var f=document.querySelector("head");f.insertBefore(e,f.firstChild)}(),function(a){function b(a,b){var b=b||{},e=b.buttons;if(void 0===e)switch(b.which){case 1:e=1;break;case 2:e=4;break;case 3:e=2;break;default:e=0}var f;if(c)f=new MouseEvent(a,b);else{f=document.createEvent("MouseEvent");var g={bubbles:!1,cancelable:!1,view:null,detail:null,screenX:0,screenY:0,clientX:0,clientY:0,ctrlKey:!1,altKey:!1,shiftKey:!1,metaKey:!1,button:0,relatedTarget:null};Object.keys(g).forEach(function(a){a in b&&(g[a]=b[a])}),f.initMouseEvent(a,g.bubbles,g.cancelable,g.view,g.detail,g.screenX,g.screenY,g.clientX,g.clientY,g.ctrlKey,g.altKey,g.shiftKey,g.metaKey,g.button,g.relatedTarget)}d||Object.defineProperty(f,"buttons",{get:function(){return e},enumerable:!0});var h=0;return h=b.pressure?b.pressure:e?.5:0,Object.defineProperties(f,{pointerId:{value:b.pointerId||0,enumerable:!0},width:{value:b.width||0,enumerable:!0},height:{value:b.height||0,enumerable:!0},pressure:{value:h,enumerable:!0},tiltX:{value:b.tiltX||0,enumerable:!0},tiltY:{value:b.tiltY||0,enumerable:!0},pointerType:{value:b.pointerType||"",enumerable:!0},hwTimestamp:{value:b.hwTimestamp||0,enumerable:!0},isPrimary:{value:b.isPrimary||!1,enumerable:!0}}),f}var c=!1,d=!1;try{var e=new MouseEvent("click",{buttons:1});c=!0,d=1===e.buttons}catch(f){}a.PointerEvent=b}(window),function(a){function b(){this.ids=[],this.pointers=[]}b.prototype={set:function(a,b){var c=this.ids.indexOf(a);c>-1?this.pointers[c]=b:(this.ids.push(a),this.pointers.push(b))},has:function(a){return this.ids.indexOf(a)>-1},"delete":function(a){var b=this.ids.indexOf(a);b>-1&&(this.ids.splice(b,1),this.pointers.splice(b,1))},get:function(a){var b=this.ids.indexOf(a);return this.pointers[b]},get size(){return this.pointers.length},clear:function(){this.ids.length=0,this.pointers.length=0}},a.PointerMap=b}(window.PointerEventsPolyfill),function(a){var b;if("undefined"!=typeof WeakMap&&navigator.userAgent.indexOf("Firefox/")<0)b=WeakMap;else{var c=Object.defineProperty,d=Object.hasOwnProperty,e=(new Date).getTime()%1e9;b=function(){this.name="__st"+(1e9*Math.random()>>>0)+(e++ +"__")},b.prototype={set:function(a,b){c(a,this.name,{value:b,writable:!0})},get:function(a){return d.call(a,this.name)?a[this.name]:void 0},"delete":function(a){this.set(a,void 0)}}}a.SideTable=b}(window.PointerEventsPolyfill),function(a){var b={targets:new a.SideTable,handledEvents:new a.SideTable,scrollType:new a.SideTable,pointermap:new a.PointerMap,events:[],eventMap:{},eventSources:{},registerSource:function(a,b){var c=b,d=c.events;d&&(this.events=this.events.concat(d),d.forEach(function(a){c[a]&&(this.eventMap[a]=c[a].bind(c))},this),this.eventSources[a]=c)},registerTarget:function(a,b){this.scrollType.set(a,b||"none"),this.listen(this.events,a,this.boundHandler)},unregisterTarget:function(a){this.scrollType.set(a,null),this.unlisten(this.events,a,this.boundHandler)},down:function(a){this.fireEvent("pointerdown",a)},move:function(a){this.fireEvent("pointermove",a)},up:function(a){this.fireEvent("pointerup",a)},enter:function(a){a.bubbles=!1,this.fireEvent("pointerenter",a)},leave:function(a){a.bubbles=!1,this.fireEvent("pointerleave",a)},over:function(a){a.bubbles=!0,this.fireEvent("pointerover",a)},out:function(a){a.bubbles=!0,this.fireEvent("pointerout",a)},cancel:function(a){this.fireEvent("pointercancel",a)},leaveOut:function(a){a.target.contains(a.relatedTarget)||this.leave(a),this.out(a)},enterOver:function(a){a.target.contains(a.relatedTarget)||this.enter(a),this.over(a)},eventHandler:function(a){if(!this.handledEvents.get(a)){var b=a.type,c=this.eventMap&&this.eventMap[b];c&&c(a),this.handledEvents.set(a,!0)}},listen:function(a,b,c){a.forEach(function(a){this.addEvent(a,c,!1,b)},this)},unlisten:function(a,b,c){a.forEach(function(a){this.removeEvent(a,c,!1,b)},this)},addEvent:function(a,b,c,d){d.addEventListener(a,b,c)},removeEvent:function(a,b,c,d){d.removeEventListener(a,b,c)},makeEvent:function(a,b){var c=new PointerEvent(a,b);return this.targets.set(c,this.targets.get(b)||b.target),c},fireEvent:function(a,b){var c=this.makeEvent(a,b);return this.dispatchEvent(c)},cloneEvent:function(a){var b={};for(var c in a)b[c]=a[c];return b},getTarget:function(a){return this.captureInfo&&this.captureInfo.id===a.pointerId?this.captureInfo.target:this.targets.get(a)},setCapture:function(a,b){this.captureInfo&&this.releaseCapture(this.captureInfo.id),this.captureInfo={id:a,target:b};var c=new PointerEvent("gotpointercapture",{bubbles:!0});this.implicitRelease=this.releaseCapture.bind(this,a),document.addEventListener("pointerup",this.implicitRelease),document.addEventListener("pointercancel",this.implicitRelease),this.targets.set(c,b),this.asyncDispatchEvent(c)},releaseCapture:function(a){if(this.captureInfo&&this.captureInfo.id===a){var b=new PointerEvent("lostpointercapture",{bubbles:!0}),c=this.captureInfo.target;this.captureInfo=null,document.removeEventListener("pointerup",this.implicitRelease),document.removeEventListener("pointercancel",this.implicitRelease),this.targets.set(b,c),this.asyncDispatchEvent(b)}},dispatchEvent:function(a){var b=this.getTarget(a);return b?b.dispatchEvent(a):void 0},asyncDispatchEvent:function(a){setTimeout(this.dispatchEvent.bind(this,a),0)}};b.boundHandler=b.eventHandler.bind(b),a.dispatcher=b}(window.PointerEventsPolyfill),function(a){var b=a.dispatcher,c=Array.prototype.forEach.call.bind(Array.prototype.forEach),d=Array.prototype.map.call.bind(Array.prototype.map),e={ATTRIB:"touch-action",SELECTOR:"[touch-action]",EMITTER:"none",XSCROLLER:"pan-x",YSCROLLER:"pan-y",SCROLLER:/^(?:pan-x pan-y)|(?:pan-y pan-x)|scroll$/,OBSERVER_INIT:{subtree:!0,childList:!0,attributes:!0,attributeFilter:["touch-action"]},watchSubtree:function(b){a.targetFinding.canTarget(b)&&h.observe(b,this.OBSERVER_INIT)},enableOnSubtree:function(a){var b=a||document;this.watchSubtree(a),b===document&&"complete"!==document.readyState?this.installOnLoad():this.installNewSubtree(b)},installNewSubtree:function(a){c(this.findElements(a),this.addElement,this)},findElements:function(a){var b=a||document;return b.querySelectorAll?b.querySelectorAll(this.SELECTOR):[]},touchActionToScrollType:function(a){var b=a;return b===this.EMITTER?"none":b===this.XSCROLLER?"X":b===this.YSCROLLER?"Y":this.SCROLLER.exec(b)?"XY":void 0},removeElement:function(c){b.unregisterTarget(c);var d=a.targetFinding.shadow(c);d&&b.unregisterTarget(d)},addElement:function(c){var d=c.getAttribute&&c.getAttribute(this.ATTRIB),e=this.touchActionToScrollType(d);if(e){b.registerTarget(c,e);var f=a.targetFinding.shadow(c);f&&b.registerTarget(f,e)}},elementChanged:function(a){this.removeElement(a),this.addElement(a)},concatLists:function(a,b){for(var c,d=0,e=b.length;e>d&&(c=b[d]);d++)a.push(c);return a},installOnLoad:function(){document.addEventListener("DOMContentLoaded",this.installNewSubtree.bind(this,document))},flattenMutationTree:function(a){var b=d(a,this.findElements,this);return b.push(a),b.reduce(this.concatLists,[])},mutationWatcher:function(a){a.forEach(this.mutationHandler,this)},mutationHandler:function(a){var b=a;if("childList"===b.type){var c=this.flattenMutationTree(b.addedNodes);c.forEach(this.addElement,this);var d=this.flattenMutationTree(b.removedNodes);d.forEach(this.removeElement,this)}else"attributes"===b.type&&this.elementChanged(b.target)}},f=e.mutationWatcher.bind(e);a.installer=e,a.register=e.enableOnSubtree.bind(e),a.setTouchAction=function(a,c){var d=this.touchActionToScrollType(c);d?b.registerTarget(a,d):b.unregisterTarget(a)}.bind(e);var g=window.MutationObserver||window.WebKitMutationObserver;if(g)var h=new g(f);else e.watchSubtree=function(){console.warn("PointerEventsPolyfill: MutationObservers not found, touch-action will not be dynamically detected")}}(window.PointerEventsPolyfill),function(a){var b=a.dispatcher,c=b.pointermap,d=25,e={POINTER_ID:1,POINTER_TYPE:"mouse",events:["mousedown","mousemove","mouseup","mouseover","mouseout"],global:["mousedown","mouseup","mouseover","mouseout"],lastTouches:[],mouseHandler:b.eventHandler.bind(b),isEventSimulatedFromTouch:function(a){for(var b,c=this.lastTouches,e=a.clientX,f=a.clientY,g=0,h=c.length;h>g&&(b=c[g]);g++){var i=Math.abs(e-b.x),j=Math.abs(f-b.y);if(d>=i&&d>=j)return!0}},prepareEvent:function(a){var c=b.cloneEvent(a);return c.pointerId=this.POINTER_ID,c.isPrimary=!0,c.pointerType=this.POINTER_TYPE,c},mousedown:function(a){if(!this.isEventSimulatedFromTouch(a)){var d=c.has(this.POINTER_ID);if(d&&(this.cancel(a),d=!1),!d){var e=this.prepareEvent(a);c.set(this.POINTER_ID,a),b.down(e),b.listen(this.global,document,this.mouseHandler)}}},mousemove:function(a){if(!this.isEventSimulatedFromTouch(a)){var c=this.prepareEvent(a);b.move(c)}},mouseup:function(a){if(!this.isEventSimulatedFromTouch(a)){var d=c.get(this.POINTER_ID);if(d&&d.button===a.button){var e=this.prepareEvent(a);b.up(e),this.cleanupMouse()}}},mouseover:function(a){if(!this.isEventSimulatedFromTouch(a)){var c=this.prepareEvent(a);b.enterOver(c)}},mouseout:function(a){if(!this.isEventSimulatedFromTouch(a)){var c=this.prepareEvent(a);b.leaveOut(c)}},cancel:function(a){var c=this.prepareEvent(a);b.cancel(c),this.cleanupMouse()},cleanupMouse:function(){c.delete(this.POINTER_ID),b.unlisten(this.global,document,this.mouseHandler)}};b.listen(["mousemove"],document,b.boundHandler),a.mouseEvents=e}(window.PointerEventsPolyfill),function(a){var b=a.dispatcher,c=a.findTarget,d=b.pointermap,e=b.scrollType,f=Array.prototype.map.call.bind(Array.prototype.map),g=2500,h={events:["touchstart","touchmove","touchend","touchcancel"],POINTER_TYPE:"touch",firstTouch:null,isPrimaryTouch:function(a){return this.firstTouch===a.identifier},setPrimaryTouch:function(a){null===this.firstTouch&&(this.firstTouch=a.identifier,this.firstXY={X:a.clientX,Y:a.clientY},this.scrolling=!1)},removePrimaryTouch:function(a){this.isPrimaryTouch(a)&&(this.firstTouch=null,this.firstXY=null)},touchToPointer:function(a){var d=b.cloneEvent(a);return d.pointerId=a.identifier+2,d.target=c(d),d.bubbles=!0,d.cancelable=!0,d.button=0,d.buttons=1,d.width=a.webkitRadiusX||a.radiusX,d.height=a.webkitRadiusY||a.radiusY,d.pressure=a.webkitForce||a.force,d.isPrimary=this.isPrimaryTouch(a),d.pointerType=this.POINTER_TYPE,d},processTouches:function(a,b){var c=a.changedTouches,d=f(c,this.touchToPointer,this);d.forEach(b,this)},shouldScroll:function(a){if(this.firstXY){var b,c=e.get(a.currentTarget);if("none"===c)b=!1;else if("XY"===c)b=!0;else{var d=a.changedTouches[0],f=c,g="Y"===c?"X":"Y",h=Math.abs(d["client"+f]-this.firstXY[f]),i=Math.abs(d["client"+g]-this.firstXY[g]);b=h>=i}return this.firstXY=null,b}},findTouch:function(a,b){for(var c,d=0,e=a.length;e>d&&(c=a[d]);d++)if(c.identifier===b)return!0},vacuumTouches:function(a){var b=a.touches;if(d.size>=b.length){var c=[];d.ids.forEach(function(a){if(1!==a&&!this.findTouch(b,a-2)){var e=d.get(a).out;c.push(this.touchToPointer(e))}},this),c.forEach(this.cancelOut,this)}},touchstart:function(a){this.vacuumTouches(a),this.setPrimaryTouch(a.changedTouches[0]),this.dedupSynthMouse(a),this.scrolling||this.processTouches(a,this.overDown)},overDown:function(a){d.set(a.pointerId,{target:a.target,out:a,outTarget:a.target}),b.over(a),b.down(a)},touchmove:function(a){this.scrolling||(this.shouldScroll(a)?(this.scrolling=!0,this.touchcancel(a)):(a.preventDefault(),this.processTouches(a,this.moveOverOut)))},moveOverOut:function(a){var c=a,e=d.get(c.pointerId);if(e){var f=e.out,g=e.outTarget;b.move(c),f&&g!==c.target&&(f.relatedTarget=c.target,c.relatedTarget=g,f.target=g,c.target?(b.leaveOut(f),b.enterOver(c)):(c.target=g,c.relatedTarget=null,this.cancelOut(c))),e.out=c,e.outTarget=c.target}},touchend:function(a){this.dedupSynthMouse(a),this.processTouches(a,this.upOut)},upOut:function(a){this.scrolling||(b.up(a),b.out(a)),this.cleanUpPointer(a)},touchcancel:function(a){this.processTouches(a,this.cancelOut)},cancelOut:function(a){b.cancel(a),b.out(a),this.cleanUpPointer(a)},cleanUpPointer:function(a){d.delete(a.pointerId),this.removePrimaryTouch(a)},dedupSynthMouse:function(b){var c=a.mouseEvents.lastTouches,d=b.changedTouches[0];if(this.isPrimaryTouch(d)){var e={x:d.clientX,y:d.clientY};c.push(e);var f=function(a,b){var c=a.indexOf(b);c>-1&&a.splice(c,1)}.bind(null,c,e);setTimeout(f,g)}}};a.touchEvents=h}(window.PointerEventsPolyfill),function(a){var b=a.dispatcher,c=b.pointermap,d={events:["MSPointerDown","MSPointerMove","MSPointerUp","MSPointerOut","MSPointerOver","MSPointerCancel","MSGotPointerCapture","MSLostPointerCapture"],POINTER_TYPES:["","unavailable","touch","pen","mouse"],prepareEvent:function(a){var c=b.cloneEvent(a);return c.pointerType=this.POINTER_TYPES[a.pointerType],c},cleanup:function(a){c.delete(a)},MSPointerDown:function(a){c.set(a.pointerId,a);var d=this.prepareEvent(a);b.down(d)},MSPointerMove:function(a){var c=this.prepareEvent(a);b.move(c)},MSPointerUp:function(a){var c=this.prepareEvent(a);b.up(c),this.cleanup(a.pointerId)},MSPointerOut:function(a){var c=this.prepareEvent(a);b.leaveOut(c)},MSPointerOver:function(a){var c=this.prepareEvent(a);b.enterOver(c)},MSPointerCancel:function(a){var c=this.prepareEvent(a);b.cancel(c),this.cleanup(a.pointerId)},MSLostPointerCapture:function(a){var c=b.makeEvent("lostpointercapture",a);b.dispatchEvent(c)},MSGotPointerCapture:function(a){var c=b.makeEvent("gotpointercapture",a);b.dispatchEvent(c)}};a.msEvents=d}(window.PointerEventsPolyfill),function(a){var b=a.dispatcher,c=a.installer;if(void 0===window.navigator.pointerEnabled){if(window.navigator.msPointerEnabled){var d=window.navigator.msMaxTouchPoints;Object.defineProperty(window.navigator,"maxTouchPoints",{value:d,enumerable:!0}),b.registerSource("ms",a.msEvents),b.registerTarget(document)}else b.registerSource("mouse",a.mouseEvents),void 0!==window.ontouchstart&&b.registerSource("touch",a.touchEvents),c.enableOnSubtree(document);Object.defineProperty(window.navigator,"pointerEnabled",{value:!0,enumerable:!0})}}(window.PointerEventsPolyfill),function(a){function b(a){if(!e.pointermap.has(a))throw new Error("InvalidPointerId")}var c,d,e=a.dispatcher,f=window.navigator;f.msPointerEnabled?(c=function(a){b(a),this.msSetPointerCapture(a)},d=function(a){b(a),this.msReleasePointerCapture(a)}):(c=function(a){b(a),e.setCapture(a,this)},d=function(a){b(a),e.releaseCapture(a,this)}),Element.prototype.setPointerCapture||Object.defineProperties(Element.prototype,{setPointerCapture:{value:c},releasePointerCapture:{value:d}})}(window.PointerEventsPolyfill),PointerGestureEvent.prototype.preventTap=function(){this.tapPrevented=!0},function(a){a=a||{},a.utils={LCA:{find:function(a,b){if(a===b)return a;if(a.contains){if(a.contains(b))return a;if(b.contains(a))return b}var c=this.depth(a),d=this.depth(b),e=c-d;for(e>0?a=this.walk(a,e):b=this.walk(b,-e);a&&b&&a!==b;)a=this.walk(a,1),b=this.walk(b,1);return a},walk:function(a,b){for(var c=0;b>c;c++)a=a.parentNode;return a},depth:function(a){for(var b=0;a;)b++,a=a.parentNode;return b}}},a.findLCA=function(b,c){return a.utils.LCA.find(b,c)},window.PointerGestures=a}(window.PointerGestures),function(a){var b;if("undefined"!=typeof WeakMap&&navigator.userAgent.indexOf("Firefox/")<0)b=WeakMap;else{var c=Object.defineProperty,d=Object.hasOwnProperty,e=(new Date).getTime()%1e9;b=function(){this.name="__st"+(1e9*Math.random()>>>0)+(e++ +"__")},b.prototype={set:function(a,b){c(a,this.name,{value:b,writable:!0})},get:function(a){return d.call(a,this.name)?a[this.name]:void 0},"delete":function(a){this.set(a,void 0)}}}a.SideTable=b}(window.PointerGestures),function(a){function b(){this.ids=[],this.pointers=[]}b.prototype={set:function(a,b){var c=this.ids.indexOf(a);c>-1?this.pointers[c]=b:(this.ids.push(a),this.pointers.push(b))},has:function(a){return this.ids.indexOf(a)>-1},"delete":function(a){var b=this.ids.indexOf(a);b>-1&&(this.ids.splice(b,1),this.pointers.splice(b,1))},get:function(a){var b=this.ids.indexOf(a);return this.pointers[b]},get size(){return this.pointers.length},clear:function(){this.ids.length=0,this.pointers.length=0}},window.Map&&(b=window.Map),a.PointerMap=b}(window.PointerGestures),function(a){var b={handledEvents:new a.SideTable,targets:new a.SideTable,handlers:{},recognizers:{},events:["pointerdown","pointermove","pointerup","pointerover","pointerout","pointercancel"],registerRecognizer:function(a,b){var c=b;this.recognizers[a]=c,this.events.forEach(function(a){if(c[a]){var b=c[a].bind(c);this.addHandler(a,b)}},this)},addHandler:function(a,b){var c=a;this.handlers[c]||(this.handlers[c]=[]),this.handlers[c].push(b)},registerTarget:function(a){this.listen(this.events,a)},unregisterTarget:function(a){this.unlisten(this.events,a)},eventHandler:function(a){if(!this.handledEvents.get(a)){var b,c=a.type;(b=this.handlers[c])&&this.makeQueue(b,a),this.handledEvents.set(a,!0)}},makeQueue:function(a,b){var c=this.cloneEvent(b);setTimeout(this.runQueue.bind(this,a,c),0)},runQueue:function(a,b){this.currentPointerId=b.pointerId;for(var c,d=0,e=a.length;e>d&&(c=a[d]);d++)c(b);this.currentPointerId=0},listen:function(a,b){a.forEach(function(a){this.addEvent(a,this.boundHandler,!1,b)},this)},unlisten:function(a){a.forEach(function(a){this.removeEvent(a,this.boundHandler,!1,inTarget)},this)},addEvent:function(a,b,c,d){d.addEventListener(a,b,c)},removeEvent:function(a,b,c,d){d.removeEventListener(a,b,c)},makeEvent:function(a,b){return new PointerGestureEvent(a,b)},cloneEvent:function(a){var b={};for(var c in a)b[c]=a[c];return b},dispatchEvent:function(a,b){var c=b||this.targets.get(a);c&&(c.dispatchEvent(a),a.tapPrevented&&this.preventTap(this.currentPointerId))},asyncDispatchEvent:function(a,b){var c=function(){this.dispatchEvent(a,b)}.bind(this);setTimeout(c,0)},preventTap:function(a){var b=this.recognizers.tap;b&&b.preventTap(a)}};b.boundHandler=b.eventHandler.bind(b),a.dispatcher=b,a.register=function(b){var c=window.PointerEventsPolyfill;c&&c.register(b),a.dispatcher.registerTarget(b)},b.registerTarget(document)}(window.PointerGestures),function(a){var b=a.dispatcher,c={HOLD_DELAY:200,WIGGLE_THRESHOLD:16,events:["pointerdown","pointermove","pointerup","pointercancel"],heldPointer:null,holdJob:null,pulse:function(){var a=Date.now()-this.heldPointer.timeStamp,b=this.held?"holdpulse":"hold";this.fireHold(b,a),this.held=!0},cancel:function(){clearInterval(this.holdJob),this.held&&this.fireHold("release"),this.held=!1,this.heldPointer=null,this.target=null,this.holdJob=null},pointerdown:function(a){a.isPrimary&&!this.heldPointer&&(this.heldPointer=a,this.target=a.target,this.holdJob=setInterval(this.pulse.bind(this),this.HOLD_DELAY))},pointerup:function(a){this.heldPointer&&this.heldPointer.pointerId===a.pointerId&&this.cancel()},pointercancel:function(){this.cancel()},pointermove:function(a){if(this.heldPointer&&this.heldPointer.pointerId===a.pointerId){var b=a.clientX-this.heldPointer.clientX,c=a.clientY-this.heldPointer.clientY;b*b+c*c>this.WIGGLE_THRESHOLD&&this.cancel()}},fireHold:function(a,c){var d={pointerType:this.heldPointer.pointerType};c&&(d.holdTime=c);var e=b.makeEvent(a,d);b.dispatchEvent(e,this.target),e.tapPrevented&&b.preventTap(this.heldPointer.pointerId)}};b.registerRecognizer("hold",c)}(window.PointerGestures),function(a){var b=a.dispatcher,c=new a.PointerMap,d={events:["pointerdown","pointermove","pointerup","pointercancel"],WIGGLE_THRESHOLD:4,clampDir:function(a){return a>0?1:-1},calcPositionDelta:function(a,b){var c=0,d=0;return a&&b&&(c=b.pageX-a.pageX,d=b.pageY-a.pageY),{x:c,y:d}},fireTrack:function(a,c,d){var e=d,f=this.calcPositionDelta(e.downEvent,c),g=this.calcPositionDelta(e.lastMoveEvent,c);g.x&&(e.xDirection=this.clampDir(g.x)),g.y&&(e.yDirection=this.clampDir(g.y));var h={dx:f.x,dy:f.y,ddx:g.x,ddy:g.y,clientX:c.clientX,clientY:c.clientY,pageX:c.pageX,pageY:c.pageY,screenX:c.screenX,screenY:c.screenY,xDirection:e.xDirection,yDirection:e.yDirection,trackInfo:e.trackInfo,pointerType:c.pointerType};"trackend"===a&&(h._releaseTarget=c.target);var i=b.makeEvent(a,h);e.lastMoveEvent=c,b.dispatchEvent(i,e.downTarget)},pointerdown:function(a){if(a.isPrimary&&("mouse"===a.pointerType?1===a.buttons:!0)){var b={downEvent:a,downTarget:a.target,trackInfo:{},lastMoveEvent:null,xDirection:0,yDirection:0,tracking:!1};c.set(a.pointerId,b)}},pointermove:function(a){var b=c.get(a.pointerId);if(b)if(b.tracking)this.fireTrack("track",a,b);else{var d=this.calcPositionDelta(b.downEvent,a),e=d.x*d.x+d.y*d.y;e>this.WIGGLE_THRESHOLD&&(b.tracking=!0,this.fireTrack("trackstart",b.downEvent,b),this.fireTrack("track",a,b))}},pointerup:function(a){var b=c.get(a.pointerId);b&&(b.tracking&&this.fireTrack("trackend",a,b),c.delete(a.pointerId))},pointercancel:function(a){this.pointerup(a)}};b.registerRecognizer("track",d)}(window.PointerGestures),function(a){var b=a.dispatcher,c={MIN_VELOCITY:.5,MAX_QUEUE:4,moveQueue:[],target:null,pointerId:null,events:["pointerdown","pointermove","pointerup","pointercancel"],pointerdown:function(a){a.isPrimary&&!this.pointerId&&(this.pointerId=a.pointerId,this.target=a.target,this.addMove(a))},pointermove:function(a){a.pointerId===this.pointerId&&this.addMove(a)},pointerup:function(a){a.pointerId===this.pointerId&&this.fireFlick(a),this.cleanup()},pointercancel:function(){this.cleanup()},cleanup:function(){this.moveQueue=[],this.target=null,this.pointerId=null},addMove:function(a){this.moveQueue.length>=this.MAX_QUEUE&&this.moveQueue.shift(),this.moveQueue.push(a)},fireFlick:function(a){for(var c,d,e,f,g,h,i,j=a,k=this.moveQueue.length,l=0,m=0,n=0,o=0;k>o&&(i=this.moveQueue[o]);o++)c=j.timeStamp-i.timeStamp,d=j.clientX-i.clientX,e=j.clientY-i.clientY,f=d/c,g=e/c,h=Math.sqrt(f*f+g*g),h>n&&(l=f,m=g,n=h);var p=Math.abs(l)>Math.abs(m)?"x":"y",q=this.calcAngle(l,m);if(Math.abs(n)>=this.MIN_VELOCITY){var r=b.makeEvent("flick",{xVelocity:l,yVelocity:m,velocity:n,angle:q,majorAxis:p,pointerType:a.pointerType});b.dispatchEvent(r,this.target)}},calcAngle:function(a,b){return 180*Math.atan2(b,a)/Math.PI}};b.registerRecognizer("flick",c)}(window.PointerGestures),function(a){var b=a.dispatcher,c=new a.PointerMap,d={events:["pointerdown","pointermove","pointerup","pointercancel"],pointerdown:function(a){a.isPrimary&&!a.tapPrevented&&c.set(a.pointerId,{target:a.target,x:a.clientX,y:a.clientY})},pointermove:function(a){if(a.isPrimary){var b=c.get(a.pointerId);b&&a.tapPrevented&&c.delete(a.pointerId)}},pointerup:function(d){var e=c.get(d.pointerId);if(e&&!d.tapPrevented){var f=a.findLCA(e.target,d.target);if(f){var g=b.makeEvent("tap",{x:d.clientX,y:d.clientY,pointerType:d.pointerType});b.dispatchEvent(g,f)}}c.delete(d.pointerId)},pointercancel:function(a){c.delete(a.pointerId)},preventTap:function(a){c.delete(a)}};b.registerRecognizer("tap",d)}(window.PointerGestures);
/*
//@ sourceMappingURL=platform.min.js.map
*/;
require(["appbuilder"]);
