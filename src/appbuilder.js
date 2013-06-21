define(['text!appbuilder.html', 'text!appbuilder.css', 'ui-util', 'graph-ui', 'events', 'connections'],
  function (appbuilder_html, appbuilder_css, ui_util, graph_ui_module, events_module, connections_module) {

  ui_util.attachCSSFromString(appbuilder_css);
  var __rootHTML = ui_util.getDomFragmentFromString(appbuilder_html);

  var __sentencePanelElement = __rootHTML.querySelector('.webmaker-appbuilder-connection-sentence').cloneNode(true);
  document.body.appendChild(__sentencePanelElement);

  var __connectionListElement = __rootHTML.querySelector('.webmaker-appbuilder-connection-list').cloneNode(true);
  var __connectionListDetailElement = __connectionListElement.querySelector('.connection-details');
  document.body.appendChild(__connectionListElement);
  __connectionListDetailElement.parentNode.removeChild(__connectionListDetailElement);

  var __currentSentenceController;

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
        console.log(controller.connections.getOutputConnections());
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

      return controller;
    }
  };

  setTimeout(function () {
    var customEvent = document.createEvent('CustomEvent');
    customEvent.initCustomEvent('appbuilderloaded', false, false, appbuilder);
    window.dispatchEvent(customEvent);
  }, 10);

  return appbuilder;

});