define([], function () {

  function Connection (outputEndpoint, outputType, inputEndpoint, inputType) {
    this.inputEndpoint = inputEndpoint;
    this.outputEndpoint = outputEndpoint;
    this.inputType = inputType;
    this.outputType = outputType;

    this.send = function (data) {
      console.log(data);
      inputEndpoint.receive(inputType, data);
    };
  }
  
  function createEndpoint (element, onReceive) {
    var _outputs = {};
    var _inputs = {};
    var _connections = {
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
            inputs.slice(idx, 1);
          }
        }
      },
      removeOutputConnection: function (connection) {
        var outputs = _outputs[connection.outputType];
        if (outputs) {
          var idx = outputs.indexOf(connection);
          if (idx > -1) {
            outputs.slice(idx, 1);
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