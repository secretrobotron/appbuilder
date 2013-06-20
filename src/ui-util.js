define([], function () {
  return {
    getDomFragmentFromString: function (inputString) {
      var range = document.createRange();
      var container = document.body || document.head;
      var fragment;

      range.selectNode(container);
      fragment = range.createContextualFragment(inputString);

      return fragment;
    },
    attachCSSFromString: function (cssString) {
      var element = document.createElement('style');
      element.innerHTML = cssString;
      document.head.appendChild(element);
    }
  }
  
});