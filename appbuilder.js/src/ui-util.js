define([], function () {
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