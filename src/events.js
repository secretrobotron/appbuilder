define([], function() {
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