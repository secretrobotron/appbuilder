define(['ui-util', 'text!connection.html'], function (ui_util, connection_html) {

  var __active = true;
  var __rootHTML;

  function Connection (outputEndpoint, outputType, inputEndpoint, inputType) {
    this.inputEndpoint = inputEndpoint;
    this.outputEndpoint = outputEndpoint;
    this.inputType = inputType;
    this.outputType = outputType;

    var element = this.element = __rootHTML.querySelector('*[data-appbuilder-connection]').cloneNode(true);
    element.setAttribute('to', '#' + inputEndpoint._parent.name);
    element.setAttribute('from', '#' + outputEndpoint._parent.name);
    element.setAttribute('input', inputType);
    element.setAttribute('output', outputType);

    this.send = function (data) {
      inputEndpoint.receive(inputType, data);
    };

    this.addToDOM = function () {
      document.body.appendChild(this.element);
    };

    this.removeFromDOM = function () {
      document.body.removeChild(this.element);
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
        if (__active) {
          var connections = _outputs[type];
          if (connections) {
            connections.forEach(function (c) {
              c.send(data);
            });
          }
        }
      },
      receive: onReceive
    };

    return _connections;
  }

  return {
    init: function () {
      __rootHTML = ui_util.getDomFragmentFromString(connection_html);
    },
    setActive: function (value) {
      __active = !!value;
    },
    createEndpoint: createEndpoint,
    createConnection: function (outputEndpoint, outputType, inputEndpoint, inputType) {
      return new Connection(outputEndpoint, outputType, inputEndpoint, inputType);
    }
  };
});