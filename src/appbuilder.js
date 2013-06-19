define(['events', 'connections'], function (events_module, connections_module) {
  
  var appbuilder = window.appbuilder = {
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
    }
  };

});