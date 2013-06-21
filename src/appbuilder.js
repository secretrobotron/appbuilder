define(['text!appbuilder.html', 'text!appbuilder.css', 'ui-util', 'graph-ui', 'events', 'connections'],
  function (appbuilder_html, appbuilder_css, ui_util, graph_ui_module, events_module, connections_module) {

  ui_util.attachCSSFromString(appbuilder_css);
  var __rootHTML = ui_util.getDomFragmentFromString(appbuilder_html);

  var __sentencePanelElement = __rootHTML.querySelector('.webmaker-appbuilder-connection-sentence-panel').cloneNode(true);
  document.body.appendChild(__sentencePanelElement);

  var __currentSentenceController;

  function createConnectionSentence (outputElement, inputElement, onAccept, onCancel) {
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
    initElement: function (element, definition) {
      definition = definition || element._appbuilder;
      if (!definition) {
        throw "No definition found for element.";
      }

      var controller = element._appbuilder = {};
      controller.events = events_module.createEventManager();
      controller.connections = connections_module.createEndpoint(element, function (type, data) {
        controller.events.dispatch('receive:' + type, data);
      });

      controller.name = element.name || element.getAttribute('name') || element.tagName;
      controller.definition = definition;

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
        controller.events.dispatch('connect', otherObject);
      };

      controller.disconnectOutput = function (outputType, otherObject, inputType) {
        var connection = controller.connections.getOutputConection(outputType, from, inputType);
        if (connection) {
          controller.removeOutputConnection(connection);
          otherObject.connections.removeInputConnection(connection);
        }
        controller.events.dispatch('disconnect', otherObject);
      };

      graph_ui_module.addElement(element);

      function onMouseDown (e) {
        if (e.which !== 1) { return; }
        e.stopPropagation();
        e.preventDefault();

        var timeout = -1;
        var mouseX = e.clientX, mouseY = e.clientY;
        function onMouseMove (e) {
          mouseX = e.clientX;
          mouseY = e.clientY;
        }

        function onMouseUpBeforeTimeout (e) {
          window.removeEventListener('mouseup', onMouseUpBeforeTimeout, false);
          element.addEventListener('mousedown', onMouseDown, false);
          clearTimeout(timeout);
        }

        function onMouseUpAfterTimeout (e) {
          window.removeEventListener('mouseup', onMouseUpAfterTimeout, false);
          window.removeEventListener('mousemove', onMouseMove, false);
          element.addEventListener('mousedown', onMouseDown, false);
          var connectionElement = graph_ui_module.stopDrawingPath();
          graph_ui_module.destroyOverlays();
          if (connectionElement) {
            createConnectionSentence(element, connectionElement,
              function (outputType, inputType) {
                console.log(outputType, inputType);
                element._appbuilder.connectOutput(outputType, connectionElement._appbuilder, inputType);
                graph_ui_module.destroyOverlays();
              },
              function () {
                graph_ui_module.destroyOverlays();
              });
          }
        }

        timeout = setTimeout(function () {
          window.removeEventListener('mouseup', onMouseUpBeforeTimeout, false);
          window.addEventListener('mouseup', onMouseUpAfterTimeout, false);
          graph_ui_module.startDrawingPath(mouseX + document.body.scrollLeft, mouseY + document.body.scrollTop);
          window.removeEventListener('mousemove', onMouseMove, false);
          timeout = -1;
          graph_ui_module.createOverlays(element);
        }, 500);

        window.addEventListener('mouseup', onMouseUpBeforeTimeout, false);
        window.addEventListener('mousemove', onMouseMove, false);
        element.removeEventListener('mousedown', onMouseDown, false);
      }

      element.addEventListener('mousedown', onMouseDown, false);
    }
  };

});