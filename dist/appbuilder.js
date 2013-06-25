
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