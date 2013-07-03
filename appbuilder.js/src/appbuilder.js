define(['text!appbuilder.html', 'text!appbuilder.css',
  'ui-util', 'graph-ui', 'events', 'connections', 'element'],
  function (appbuilder_html, appbuilder_css,
    ui_util, graph_ui_module,
    events_module, connections_module, element_module) {

  var __registeredElements = [];

  ui_util.attachCSSFromString(appbuilder_css);
  var __rootHTML;

  var __sentencePanelElement;
  var __connectionListElement;
  var __connectionListDetailElement;
  var __currentSentenceController;
  var __currentConnectionListController;
  var __connectionElementsForProcessing = [];

  var __ready = false;

  function showConnectionList (element, onAccept, onCancel) {
    var acceptButton = __connectionListElement.querySelector('button[data-action="accept"]');
    var cancelButton = __connectionListElement.querySelector('button[data-action="cancel"]');

    var outputDefinition = element._appbuilder.definition.outputs;
    var connectionListElement = __connectionListElement.querySelector('ul');

    var connections = element._appbuilder.connections.getOutputConnections();

    connectionListElement.innerHTML = '';

    var connectionList = [];

    var connectionIndex = 0;
    Object.keys(connections).forEach(function (outputKey) {
      connections[outputKey].forEach(function (connection) {
        var inputString = connection.inputEndpoint._parent.definition.inputs[connection.inputType].description;
        var outputString = outputDefinition[outputKey].description;

        inputString = inputString.replace('{{name}}', 'the ' + element._appbuilder.name);
        outputString = outputString.replace('{{name}}', 'the ' + connection.inputEndpoint._parent.name);

        var itemElement = __connectionListDetailElement.cloneNode(true);
        var descriptionElement = itemElement.querySelector('*[data-description]');
        var inputElement = itemElement.querySelector('input[type="checkbox"]');

        inputElement.id = 'appbuilder-connection-list-item-' + connectionIndex;
        descriptionElement.innerHTML = 'When ' + outputString + ', ' + inputString;
        descriptionElement.setAttribute('for', 'appbuilder-connection-list-item-' + connectionIndex);

        inputElement._connection = connection;

        connectionListElement.appendChild(itemElement);
        connectionList.push(connection);
        ++connectionIndex;
      });
    });

    function onAcceptButtonClick (e) {
      var uncheckedListItems = Array.prototype.slice.call(connectionListElement.querySelectorAll('input[type="checkbox"]')).filter(function (input) {
          return !input.checked;
        }).map(function (input) {
          return input._connection;
        });
      onAccept && onAccept(uncheckedListItems);
    }

    function onCancelButtonClick (e) {
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
      onAccept && onAccept(outputSelectElement.value, inputSelectElement.value);
    }

    function onCancelButtonClick (e) {
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

  // Note: this will only get called if `e.preventDefault()` is not issued by graph-ui's mousedown timeout.
  function onElementClickInGraphMode (e) {
    var element = e.currentTarget;
    if (__currentConnectionListController) {
      __currentConnectionListController.clear();
    }
    __currentConnectionListController = showConnectionList(element,
      function (connectionsToDestroy) {
        connectionsToDestroy.forEach(function (connection) {
          element._appbuilder.disconnectOutput(connection);
        });
        __currentConnectionListController.clear();
      },
      function () {
        __currentConnectionListController.clear();
      });
  }

  var appbuilder = window.appbuilder = window.appbuilder || {};

  var modeSwitchFunctions = {
    inactive: function () {
      appbuilder.disableGraphMouseEvents();
      connections_module.setActive(false);
    },
    connect: function () {
      appbuilder.enableGraphMouseEvents();
      connections_module.setActive(false);
    },
    interactive: function () {
      appbuilder.disableGraphMouseEvents();
      connections_module.setActive(true);
    }
  };

  appbuilder.switchMode = function (modeName) {
    if (modeSwitchFunctions[modeName]) {
      modeSwitchFunctions[modeName]();
      __registeredElements.forEach(function (element) {
        element._appbuilder.modes[modeName] && element._appbuilder.modes[modeName]();
      });
    }
    else {
      throw "No such appbuilder mode: " + modeName;
    }
  };

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
      element.addEventListener('click', onElementClickInGraphMode, false);
    });
  };

  appbuilder.disableGraphMouseEvents = function () {
    __registeredElements.forEach(function (element) {
      element._appbuilder.disableGraphMouseEvents();
      element.removeEventListener('click', onElementClickInGraphMode, false);
    });
  };

  appbuilder.forEachElement = function (fn) {
    __registeredElements.forEach(fn);
  };

  appbuilder.ready = function (callback) {
    if (__ready) {
      setTimeout(function () {
        callback();
      }, 10);
    }
    else {
      window.addEventListener('appbuilderloaded', function onAppBuilderLoaded(e) {
        window.removeEventListener('appbuilderloaded', onAppBuilderLoaded, false);
        callback();
      }, false);
    }
  };

  appbuilder.initElement = function (element, definition) {
    definition = definition || element._appbuilder;
    if (!definition) {
      throw "No definition found for element.";
    }

    element._appbuilder = element_module.create(element, definition, {
      onConnectionRequest: function (connectionElement) {
        if (__currentSentenceController) {
          __currentSentenceController.clear();
        }
        __currentSentenceController = openConnectionSentencePanel(element, connectionElement,
          function (outputType, inputType) {
            element._appbuilder.connectOutput(outputType, connectionElement._appbuilder, inputType);
            graph_ui_module.destroyOverlays();
            __currentSentenceController.clear();
            __currentSentenceController = null;
          },
          function () {
            graph_ui_module.destroyOverlays();
            __currentSentenceController.clear();
            __currentSentenceController = null;
          });
      }
    });

    __registeredElements.push(element);

    if (definition.connectionElements &&
        definition.connectionElements.length &&
        typeof definition.connectionElements !== 'string') {
      Array.prototype.slice.call(definition.connectionElements).forEach(function (connectionElement) {
        var querySelector = element.id ? '#' + element.id : (element.name ? element.tagName + '[name="' + element.name + '"]' : '');
        connectionElement.setAttribute('from', querySelector);
        __connectionElementsForProcessing.push(connectionElement);
      });
    }

    return element._appbuilder;

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

    __ready = true;
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