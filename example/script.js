var eventChannel;
var model = 'events';
var connectOptions = {
    apiKey: 'TEST',
    appId: 'eff09d53-e681-4fe8-a1a2-6b91b4c311e3',
    apiEndpoint: 'http://localhost:3000',
    socketEndpoint: 'http://localhost',
    timerInterval: 150
  };


var Telepat = new Telepat();
Telepat.setLogLevel('debug');

Telepat.on('login', function () {
  $('#message').html("");
  subscribe();
});

Telepat.on('logout', function () {
  console.log("logged out");
  $('.list-group').empty();
});

Telepat.on('contexts-update', function () {
  //checkLoginState();
  subscribe();
});

Telepat.on('contexts-update', function () {
  //
});

function connect() {
  Telepat.connect(connectOptions);
}

function statusChangeCallback(response) {
  if (response.status === 'connected') {
    Telepat.user.loginWithFacebook(response.authResponse.accessToken);
  } else if (response.status === 'not_authorized') {
    $('#message').html('Please log into this app.');
    Telepat.user.logout();
  } else {
    $('#message').html('Please log into Facebook.');
    Telepat.user.logout();
  }
}

function checkLoginState() {
  FB.getLoginStatus(function(response) {
    statusChangeCallback(response);
  });
}

function addObject() {
  eventChannel.objects['new'] = {
    text: 'Hello world'
  };
}

function removeObject(id) {
  delete eventChannel.objects[id];
}

function editObject(id) {
  eventChannel.objects[id].text = $('#' + id + '_input').val();
}

function appendToList(key, value) {
  $('.list-group').append('<li class="list-group-item" id="' + key + '">' + key + ': <input type="text" id="' + key + '_input" value="' + value.text + '" onkeyup="editObject(\'' + key + '\');"> <span id="' + key + '_span">' + value.text + '</span><div style="float:right"><a class="btn btn-default btn-sm" href="#" onclick="removeObject(\'' + key + '\'); return false;">Delete</a></div></li>');
}

function subscribe() {
  eventChannel = Telepat.subscribe({ channel: { context: Telepat.contexts[0].id, model: model }}, function () {
    $('#message').empty();
    //eventChannel.objects["70b7f899-1f06-4461-8dcf-fd595a053f9d"].tid = "0";
    $.each(eventChannel.objects, function (key, value) {
      appendToList(key, value);
    });
  });
  eventChannel.on('update', function (operation, parentId, parentObject, delta) {
    console.log(operation, parentId, parentObject, delta);
    if (operation == 'delete') {
      $('#' + parentId).remove();
    } else if (operation == 'add') {
      appendToList(parentId, parentObject);
    } else if (operation == 'replace') {
      $('#' + parentId + '_span').text(parentObject[delta.path]);
    }
  });
  eventChannel.on('unsubscribe', function () {
    $('.list-group').empty();
  });
  // setInterval(function() {
  //   eventChannel.objects["70b7f899-1f06-4461-8dcf-fd595a053f9d"].text = parseInt(eventChannel.objects["70b7f899-1f06-4461-8dcf-fd595a053f9d"].text) + 1;
  // }, 10);
}
