/*
 * Breach: box.js
 *
 * (c) Copyright Stanislas Polu 2013. All rights reserved.
 *
 * @author: spolu
 *
 * @log:
 * 2013-10-24 spolu   Commands integration
 * 2013-08-16 spolu   Creation
 */

var common = require('./common.js');
var factory = common.factory;
var api = require('exo_browser');

//
// ### box
//
// ```
// @spec { session }
// ```
//
var box = function(spec, my) {
  var _super = {};
  my = my || {};
  spec = spec || {};

  my.MODE_NORMAL = 1 << 0;
  my.MODE_FIND_IN_PAGE = 1 << 1;
  my.MODE_STACK_FILTER = 1 << 2;
  my.MODE_COMMAND = 1 << 3;

  my.state = {
    value: '',
    loading: false,
    can_go_back: false,
    can_go_forward: false,
    stack_visible: true,
    mode: my.MODE_NORMAL,
    mode_args: {}
  };

  my.mode_value = null;

  //
  // ### _public_
  //
  var init;           /* init(cb_); */
  var handshake;      /* handshake(); */

  //
  // ### _private_
  //
  var push;                    /* push(); */

  var stack_active_page;       /* stack_active_page(page); */
  var stack_visible;           /* stack_visible(visible); */
  var stack_clear_filter;      /* stack_clear_filter(); */
  var stack_navigation_state;  /* stack_navigation_state(); */
  var stack_loading_start;     /* stack_loading_start(); */
  var stack_loading_stop;      /* stack_loading_stop(); */

  var socket_box_input;        /* socket_box_input(input); */
  var socket_box_input_submit; /* socket_box_input_submit(input); */
  var socket_box_input_out;    /* socket_box_input_out(); */

  var socket_box_back;         /* socket_box_back(); */
  var socket_box_forward;      /* socket_box_forward(); */
  var socket_box_stack_toggle; /* socket_box_stack_toggle(); */

  var shortcut_go;             /* shortcut_go(); */
  var shortcut_back;           /* shortcut_back(); */
  var shortcut_forward;        /* shortcut_forward(); */
  var shortcut_reload;         /* shortcut_reload(); */
  var shortcut_find_in_page;   /* shortcut_find_in_page(); */
  var shortcut_stack_filter;   /* shortcut_stack_filter(); */

  var frame_find_reply;        /* frame_find_reply(frame, rid, matches, ...); */
                                      
  
  //
  // ### _protected_
  //
  var dimension;  /* dimension(); */

  //
  // #### _that_
  //
  var that = require('./control.js').control({
    session: spec.session,
    type: 'box',
    control_type: api.TOP_CONTROL
  }, my);

  /****************************************************************************/
  /* CONTROL INTERFACE                                                        */
  /****************************************************************************/

  // ### dimension
  //  
  // Returns the desired canonical dimension
  dimension = function() {
    return 35;
  };

  // ### handshake
  //
  // Receives the socket and sets up events
  // ```
  // @socket {socket.io socket}
  // ```
  handshake = function(socket) {
    _super.handshake(socket);

    my.socket.on('box_input', socket_box_input);
    my.socket.on('box_input_submit', socket_box_input_submit);
    my.socket.on('box_input_out', socket_box_input_out);

    my.socket.on('box_back', socket_box_back);
    my.socket.on('box_forward', socket_box_forward);
    my.socket.on('stack_toggle', socket_box_stack_toggle);

    push();
  };

  // ### init
  // 
  // Initialization (asynchronous) [see control.js]. Also sets up the event
  // handlers on the stack control.
  // ```
  // @cb_ {function(err)} callack
  // ```
  init = function(cb_) {
    _super.init(cb_);

    my.session.stack().on('active_page', stack_active_page);
    my.session.stack().on('visible', stack_visible);
    my.session.stack().on('clear_filter', stack_clear_filter);
    my.session.stack().on('navigation_state', stack_navigation_state);
    my.session.stack().on('loading_start', stack_loading_start);
    my.session.stack().on('loading_stop', stack_loading_stop);

    my.session.keyboard_shortcuts().on('go', shortcut_go);
    my.session.keyboard_shortcuts().on('back', shortcut_back);
    my.session.keyboard_shortcuts().on('forward', shortcut_forward);
    my.session.keyboard_shortcuts().on('reload', shortcut_reload);
    my.session.keyboard_shortcuts().on('find_in_page', shortcut_find_in_page);
    my.session.keyboard_shortcuts().on('stack_filter', shortcut_stack_filter);

    my.session.exo_browser().on('frame_find_reply', frame_find_reply);
  };

  /****************************************************************************/
  /* PRIVATE HELPERS                                                          */
  /****************************************************************************/

  // ### push
  //
  // Pushes the current active page url to the control UI for eventual update 
  // (The url might not get directly updated if it is being edited, etc)
  push = function() {
    if(my.socket) {
      my.socket.emit('state', my.state);
    }
  };

  // ### computed_value
  //
  // Computes the value that the box should have given the current state
  // ```
  // @current {string} current value if applicable (to avoid empty values)
  // ```
  computed_value = function(current) {
    var page = my.session.stack().active_page();
    var value = current || '';
    if(page) {
      page.state.entries.forEach(function(n) {
        if(n.visible) {
          var home_url_r = /^http:\/\/127\.0\.0\.1\:[0-9]+\/home\.html$/;
          if(home_url_r.test(n.url.href)) {
            value = '';
          }
          else if(n.url.href && n.url.href.length > 0) {
            value = n.url.href;
          }
        }
      });
      if(page.box_value !== null)
        value = page.box_value;
      if(my.mode_value !== null)
        value = my.mode_value;
    }
    return value;
  };

  /****************************************************************************/
  /* STACK EVENTS                                                             */
  /****************************************************************************/

  // ### stack_active_page
  //
  // Received from the stack whenever the active page is updated as it can
  // potentially impact the url to display. Sent if page has changed.
  // ```
  // @page {object} the current active page
  // ```
  stack_active_page = function(page) {
    my.state.can_go_back = page.state.can_go_back;
    my.state.can_go_forward = page.state.can_go_forward;
    my.state.mode = page.box_mode || my.MODE_NORMAL;
    my.state.mode_args = {};
    my.state.value = computed_value();
    my.state.loading = page.loading;
    push();
  };

  // ### stack_visible
  //
  // Received from the stack whenever the stack visibility is toggled
  // ```
  // @visible {boolean} whether the stack is visible
  // ```
  stack_visible = function(visible) {
    my.state.stack_visible = visible;
    push();
  };

  // ### stack_clear_filter
  //
  // Received when the the filter has been cleared by the stack
  stack_clear_filter = function() {
    if(my.state.mode === my.MODE_STACK_FILTER) {
      my.mode_value = null;
      my.state.mode = my.MODE_NORMAL;
      my.state.mode_args = {};
      my.state.value = computed_value();
      push();
    }
  };

  // ### stack_navigation_state
  //
  // Received when the navigation_state was updated (url change, box_value
  // cleared, new page entry)
  // ```
  // @page {object} the current active page
  // @clear {boolean} whether the box should be cleared
  // ```
  stack_navigation_state = function(page, clear) {
    var active = my.session.stack().active_page();
    if(page === active) {
      my.state.can_go_back = page.state.can_go_back;
      my.state.can_go_forward = page.state.can_go_forward;
      if(clear) {
        page.box_value = null;
        page.box_mode = null;
        my.mode_value = null;
        my.state.mode = my.MODE_NORMAL;
        my.state.mode_args = {};
      }
      my.state.value = computed_value(my.state.value);
      push();
    }
  };

  // ### stack_loading_start
  //
  // Received when the a frame is starting to load. We check if it is the 
  // active one and push a message if needed
  stack_loading_start = function() {
    var page = my.session.stack().active_page();
    if(page.loading && !my.state.loading) {
      my.state.loading = true;
      push();
    }
  };

  // ### stack_loading_stop
  //
  // Received when the a frame is stopping its load. We check if it is the 
  // active one and push a message if needed
  stack_loading_stop = function() {
    var page = my.session.stack().active_page();
    if(!page.loading && my.state.loading) {
      my.state.loading = false;
      push();
    }
  };

  /****************************************************************************/
  /* SOCKET EVENT HANDLERS                                                    */
  /****************************************************************************/

  // ### socket_box_input
  //
  // Received when the user types into the box
  // ```
  // @input {string} the box input string
  // ```
  socket_box_input = function(input) {
    var page = my.session.stack().active_page();
    if(page) {
      switch(my.state.mode) {
        case my.MODE_FIND_IN_PAGE: {
          page.box_value = input;
          page.frame.find(input, true, false, false);
          break;
        }
        case my.MODE_STACK_FILTER: {
          my.session.stack().filter_start(new RegExp(input.substr(1), 'i'));
          my.mode_value = input;
          if(input.length === 0) {
            my.mode_value = null;
            my.state.mode = my.MODE_NORMAL;
            my.state.mode_args = {};
            my.session.stack().filter_stop();
          }
          break;
        }
        case my.MODE_COMMAND: {
          my.mode_value = input;
          if(input.length === 0) {
            my.mode_value = null;
            my.state.mode = my.MODE_NORMAL;
            my.state.mode_args = {};
          }
          break;
        }
        case my.MODE_COMMAND:
        case my.MODE_NORMAL:
        default: {
          if(input.length === 1 && input[0] === '/') {
            my.state.mode = my.MODE_STACK_FILTER;
            my.state.mode_args = {};
            my.session.stack().filter_start(new RegExp());
            my.mode_value = input;
            page.box_value = null;
          }
          else if(input.length === 1 && input[0] === ':') {
            my.state.mode = my.MODE_COMMAND;
            my.state.mode_args = {};
            my.mode_value = input;
            page.box_value = null;
          }
          else {
            page.box_value = input;
          }
        }
      }
      my.state.value = computed_value();
    }
  };
  
  // ### socket_box_input_submit
  //
  // Received whenever the box input is submitted by the user. We operate an 
  // heuristic here, if we detect that it is an url, we sanitize it and navigate
  // to it.
  //
  // Otherwise, we perform a google search
  // ```
  // @data {object} with `input` and `is_ctrl`
  // ```
  socket_box_input_submit = function(data) {
    var page = my.session.stack().active_page();
    if(page) {
      switch(my.state.mode) {
        case my.MODE_FIND_IN_PAGE: {
          if(!data.is_ctrl) {
            page.frame.find(page.box_value, true, false, true);
          }
          else {
            page.frame.find_stop('activate');
            my.state.mode = my.MODE_NORMAL;
            my.state.mode_args = {};
            page.box_value = null;
            page.box_mode = null;
            my.state.value = computed_value();
            push();
          }
          break;
        }
        case my.MODE_STACK_FILTER: {
          my.session.stack().filter_stop(true);
          my.mode_value = null;
          page.box_value = null;
          my.state.value = computed_value();
          my.state.mode = my.MODE_NORMAL;
          my.state.mode_args = {};
          push();
          break;
        }
        case my.MODE_COMMAND: {
          my.session.commands().execute(my.mode_value.substr(1));
          my.mode_value = null;
          page.box_value = null;
          my.state.value = computed_value();
          my.state.mode = my.MODE_NORMAL;
          my.state.mode_args = {};
          push();
          break;
        }
        case my.MODE_NORMAL:
        default: {
          var url_r = /^(http(s{0,1})\:\/\/){0,1}[a-z0-9\-\.]+(\.[a-z0-9]{2,4})+/;
          var ip_r = /^(http(s{0,1})\:\/\/){0,1}[0-9]{1,3}(\.[0-9]{1,3}){3}/
          var localhost_r = /^(http(s{0,1})\:\/\/){0,1}localhost+/
          var host_r = /^http(s{0,1})\:\/\/[a-z0-9\-\.]+/
          var http_r = /^http(s{0,1})\:\/\//;
          if(url_r.test(data.value) || 
             ip_r.test(data.value) || 
             localhost_r.test(data.value) || 
             host_r.test(data.value)) {
            if(!http_r.test(data.value)) {
              data.value = 'http://' + data.value;
            }
            page.frame.load_url(data.value);
          }
          else {
            var search_url = 'https://www.google.com/search?' +
            'q=' + escape(data.value) + '&' +
              'ie=UTF-8';
            page.frame.load_url(search_url);
          }
          my.state.mode = my.MODE_NORMAL;
          my.state.mode_args = {};
          my.state.value = computed_value(data.value);
          push();
          break;
        }
      }
    }
  };

  // ### socket_box_input_out
  //
  // Event triggered when the focus of the input box has been lost.
  socket_box_input_out = function() {
    var page = my.session.stack().active_page();
    if(page) {
      switch(my.state.mode) {
        case my.MODE_FIND_IN_PAGE: {
          page.frame.find_stop('clear');
          break;
        }
        default: {
          break;
        }
      }
      my.state.mode = my.MODE_NORMAL;
      my.state.mode_args = {};
      page.box_value = null;
      page.box_mode = null;
      my.mode_value = null;
      my.state.value = computed_value();
      push();
    }
    /* Finally we refocus the page as the focus should not be on the box */
    /* anymore.                                                          */
    page.frame.focus();
  };

  // ### socket_box_back
  //
  // Received when the back button is clicked
  socket_box_back = function() {
    var page = my.session.stack().active_page();
    if(page) {
      page.frame.go_back_or_forward(-1);
    }
  };

  // ### socket_box_forward
  //
  // Received when the back button is clicked
  socket_box_forward = function() {
    var page = my.session.stack().active_page();
    if(page) {
      page.frame.go_back_or_forward(1);
    }
  };

  // ### socket_box_stack_toggle
  //
  // Received when the stack toggle button is clicked
  socket_box_stack_toggle = function() {
    my.session.stack().toggle();
  };

  /****************************************************************************/
  /* KEYBOARD SHORTCUT EVENT HANDLERS                                         */
  /****************************************************************************/

  // ### shortcut_go
  //
  // Keyboard shorcut to create focus on box and select all text
  shortcut_go = function() {
    that.focus();
    if(my.socket) {
      my.socket.emit('select_all');
    }
  };

  // ### shortcut_back
  //
  // Keyboard shorcut for the back button
  shortcut_back = function() {
    var page = my.session.stack().active_page();
    if(page) {
      page.frame.go_back_or_forward(-1);
    }
  };
  // ### shortcut_forward
  //
  // Keyboard shorcut for the forward button
  shortcut_forward = function() {
    var page = my.session.stack().active_page();
    if(page) {
      page.frame.go_back_or_forward(1);
    }
  };

  // ### shortcut_reload
  //
  // Keyboard shortuct to reload the page
  shortcut_reload = function() {
    var page = my.session.stack().active_page();
    if(page) {
      page.frame.reload();
    }
  };

  // ### shortcut_find_in_page
  //
  // Keyboard shortcut to find in page
  shortcut_find_in_page = function() {
    var page = my.session.stack().active_page();
    if(page) {
      page.frame.find_stop('clear');
    }
    my.state.mode = my.MODE_FIND_IN_PAGE;
    my.state.mode_args = {
      active: 0,
      matches: 0
    };
    my.mode_value = null;
    page.box_value = '';
    page.box_mode = my.MODE_FIND_IN_PAGE;
    that.focus(function() {
      push();
      if(my.socket) {
        my.socket.emit('select_all');
      }
    });
  };

  // ### shortcut_stack_filter
  //
  // Keyboard shortcut to trigger stack filtering
  shortcut_stack_filter = function() {
    my.state.mode = my.MODE_STACK_FILTER;
    my.state.value = '/';
    that.focus(function() {
      push();
    });
  };

  /****************************************************************************/
  /* EXOBROWSER EVENT HANDLERS                                                */
  /****************************************************************************/
  // ### frame_find_reply
  //
  // Handler called when replies are received for a find command
  // ```
  // @frame     {object} target exo_frame
  // @rid       {number} request id
  // @matches   {number} number of matches
  // @selection {object} selection rect
  // @active    {number} active index
  // @final     {boolean} final update
  // ```
  frame_find_reply = function(frame, rid, matches, selection, active, final) {
    var page = my.session.stack().page_for_frame(frame);
    if(page === my.session.stack().active_page()) {
      if(active !== -1) {
        my.state.mode_args.active = active;
      }
      if(matches !== -1) {
        my.state.mode_args.matches = matches;
      }
      push();
    }
  };


  /****************************************************************************/
  /* PUBLIC METHODS                                                           */
  /****************************************************************************/

  common.method(that, 'init', init, _super);
  common.method(that, 'handshake', handshake, _super);
  common.method(that, 'dimension', dimension, _super);

  return that;
};

exports.box = box;
