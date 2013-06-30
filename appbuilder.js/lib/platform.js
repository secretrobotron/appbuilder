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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
        var GetElementsByInterface = scope.GetElementsByInterface, ParentNodeInterface = scope.ParentNodeInterface, SelectorsInterface = scope.SelectorsInterface, mixin = scope.mixin, registerObject = scope.registerObject, DocumentFragment = registerObject(document.createDocumentFragment());
        mixin(DocumentFragment.prototype, ParentNodeInterface), mixin(DocumentFragment.prototype, SelectorsInterface), 
        mixin(DocumentFragment.prototype, GetElementsByInterface);
        var Text = registerObject(document.createTextNode("")), Comment = registerObject(document.createComment(""));
        scope.wrappers.Comment = Comment, scope.wrappers.DocumentFragment = DocumentFragment, 
        scope.wrappers.Text = Text;
    }(this.ShadowDOMPolyfill), function(scope) {
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
        "use strict";
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
    "use strict";
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
    "use strict";
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
    "use strict";
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
    "use strict";
    "function" == typeof define && define.amd ? define([ "exports" ], factory) : "undefined" != typeof exports ? factory(exports) : factory(root.esprima = {});
}(this, function(exports) {
    "use strict";
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
    "use strict";
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
*/