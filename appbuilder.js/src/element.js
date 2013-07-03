define(['graph-ui', 'events', 'connections'],
  function (graph_ui_module, events_module, connections_module) {
  var GID = 0;

  return {
    create: function (element, definition, options) {
      var controller = {};

      options = options || {};

      controller.modes = definition.modes || {}; 

      controller.events = events_module.createEventManager();
      controller.connections = connections_module.createEndpoint(controller, function (type, data) {
        controller.events.dispatch('receive:' + type, data);
      });

      element.id = element.id || 'appbuilder-element-' + GID++;
      controller.name = element.name || element.getAttribute('name') || element.id || element.tagName;
      controller.definition = definition;

      controller.states = definition.states || {};

      controller.edit = definition.edit;

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

      var graphUIMouseController = graph_ui_module.addElement(element, {
        onConnectionRequest: options.onConnectionRequest
      });

      controller.enableGraphMouseEvents = function () {
        graphUIMouseController.enable();
      };

      controller.disableGraphMouseEvents = function () {
        graphUIMouseController.disable();
      };

      return controller;  
    }
  };
});