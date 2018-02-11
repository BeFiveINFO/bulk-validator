(function ($) {
	"use strict";

	// elements
	var $validationTab = $('#validation-tab');
	var $hiddenItemTab = $('#hiddenItem-tab');

	var $validationResultsTable = $('#validationResults tbody');
	var $serverURL = $('#serverURL');
	var $IndividualReportModal = $('#individualReport');
	var $IndividualReportModalAccordionTemplate = $('#template-modalAccordion');

	// notify
	var validationProgressNotification;
	var validationProgressNotification_state = false;

	// flags
	var currentRequestsInQueue = 0;
	var totalRequestEnqueued = 0;

	// data collection
	var validationResultsCollection = {};

	// init
	$validationTab.addClass('disabled');
	$hiddenItemTab.addClass('disabled');

	// cookie
	var serverURL = $.cookie('serverurl');
	if(serverURL) {
		$serverURL.val(serverURL);
	} else {
		$serverURL.val('https://validator.w3.org/nu/');
	}

	$('#btnValidate').click(function(){
		// get text
		var _rawData = $('#rawData').val();
		// make sure there is any text data
		if(_rawData === '') {
			$validationTab.addClass('disabled');
			alert("No data found");
			return false;
		}
		// blank var
		var _urlListArray = [];
		// detect csv
		if( _rawData.match(/(?=<\?xml)/gi) ) {
			$(_rawData).find('loc').each(function(i){
				var _loc = $(this).text();
				if(_loc && _loc.match(/^https?:\/\//)) {
					_urlListArray.push(_loc);
				}
			});
			// remove duplicates
			_urlListArray = _urlListArray.filter(function (x, i, self) {return self.indexOf(x) === i;});
			$('#rawData').val(_urlListArray.join('\n'));
		} else if(_rawData.match(/<\/?[\w\s="/.':;#-\/\?]+>/gi)) {
			var _urls = _rawData.match(/https?:\/\/[^\"|^\']*/ig);
			for(var _index in _urls){
				if(
					!_urls[_index].match(/^(.*?)\/(.*?)\.(jpe?g|gif|ogv|webm|bmp|png|mp4|svg|js|css|ico|mp3)$/ig) &&
					!_urls[_index].match(/fonts\.googleapis\.com\/css\?/)
				) {
					_urlListArray.push(_urls[_index]);
				}
			}
			// remove duplicates
			_urlListArray = _urlListArray.filter(function (x, i, self) {return self.indexOf(x) === i;});
			$('#rawData').val(_urlListArray.join('\n'));
		} else if ( _rawData.indexOf('"') != -1) {
			var _data = Papa.parse(_rawData);
			if(_data.data.length == 0) {
				$validationTab.addClass('disabled');
				alert("No data found");
				return false;
			}
			for(var _index in _data.data){
				var _currentItemURL = _data.data[_index][1];
				if(_currentItemURL && _currentItemURL.match(/^https?:\/\//)) {
					_urlListArray.push(_currentItemURL);
				}
			}
			// remove duplicates
			_urlListArray = _urlListArray.filter(function (x, i, self) {return self.indexOf(x) === i;});
			$('#rawData').val(_urlListArray.join('\n'));
		} else {
			// possibly url list in plain text
			_urlListArray = _rawData.split('\n');
		}

		$validationTab.removeClass('disabled');
		$serverURL.attr('disabled',true);
		$validationTab.trigger('click');
		_processValidationByURL(_urlListArray);
	});

	// badge-success
	$(document).on('click','.resultStatus',function(e){
		var $_targetElement = $(e.target);
		if($_targetElement.hasClass('badge-success')){
			var _serverURL = $serverURL.val();
			var _resultID = $_targetElement.parent().parent().attr('data-resultID');
			var _url = validationResultsCollection[_resultID].url;
			var _requestURLstring = _serverURL+'?doc='+_url;
			window.open(_requestURLstring, '_blank');
		} else if ($_targetElement.hasClass('badge-dark')) {
			_openStatusModal($_targetElement);
		}
	});

	// individual report
	$(document).on('click','.resultInfo,.resultWarning,.resultError',function(e){
		_openStatusModal($(e.target));
	});

	function _openStatusModal($targetElement){
		// global
		var _serverURL = $serverURL.val();

		// model related
		var $_targetElement = $targetElement;
		var _resultID = $_targetElement.parent().parent().attr('data-resultID');
		var _model = validationResultsCollection[_resultID];
		if(!_model) return false;
		var _url = _model.url;

		// generated
		var _requestURLstring = _serverURL+'?doc='+_url;
		// individual report title
		var _labelURL = _getBaseName(_url);
		// data model
		var _model = validationResultsCollection[_resultID];

		// blanks
		var _modalTitle = '';
		// conditional
		if($_targetElement.hasClass('badge-danger')){
			_modalTitle = '<span class="badge badge-error">Error</span> <a href="'+_url+'" target="_blank">' + _labelURL+ '</a>';
			_constructIndividualReportAccordion('error',_model.messages);
		} else if($_targetElement.hasClass('badge-warning')){
			_modalTitle = '<span class="badge badge-warning">Warning</span> <a href="'+_url+'" target="_blank">' + _labelURL+ '</a>';
			_constructIndividualReportAccordion('warning',_model.messages);
		} else if($_targetElement.hasClass('badge-info')){
			_modalTitle = '<span class="badge badge-info">Info</span> <a href="'+_url+'" target="_blank">' + _labelURL+ '</a>';
			_constructIndividualReportAccordion('info',_model.messages);
		} else if($_targetElement.hasClass('badge-dark')){
			var _errorType = $_targetElement.parent().parent().attr('data-errorType');
			var _errorLabel = '';
			var _errorClassificationForModal = (_errorType==='nodata') ? 'nodata' : _errorType;
			if(_errorType === 'io') {
				_errorLabel = 'IO Error';
			} else if (_errorType === 'schema') {
				_errorLabel = 'Schema Error';
			} else {
				_errorLabel = 'Other errors';
			}
			_modalTitle = '<span class="badge badge-dark">'+_errorLabel+'</span> <a href="'+_url+'" target="_blank">' + _labelURL+ '</a>';
			_constructIndividualReportAccordion(_errorClassificationForModal,_model.messages);
		} else {
			return false;
		}

		// set data in modal
		$IndividualReportModal.find('#individualReportTitle').html(_modalTitle);
		$('#modalSeeFullReport').attr('href',_requestURLstring);

		// open modal
		$IndividualReportModal.modal('show');
	}

	/**
	 * bulkActionCheckbox toggles
	 */
	$(document).on('change','.tableBulkToggleCheckboxes',function(e){
		// the checkbox
		var $_targetElement = $(e.target);
		var _checkButtonState = ($_targetElement.prop("checked")) ? true : false;
		// table
		var $_targetTableBodyBulkActionCheckboxes = $($_targetElement.attr('data-targetTableElements'));
		// scan and toggle
		$_targetTableBodyBulkActionCheckboxes.each(function(i,e){
			var $_currentTargetElement = $(e);
			if(!$_currentTargetElement.attr('disabled')) {
				$_currentTargetElement.prop("checked",_checkButtonState);
			}
		});

	});

	// Bulk Action button
	$(document).on('click','.doAction',function(e){
		var $_targetElement = $(e.target);
		var _selection = $_targetElement.parent().parent().find('select').val();
		var _targetTableElements = $_targetElement.attr('data-targetTableElements');
		var $_targetTableBodyBulkActionCheckboxes = $(_targetTableElements);

		switch(_selection) {
			case 'hide':
				$_targetTableBodyBulkActionCheckboxes.each(function(i,e){
					if($(e).prop('checked')){
						$(e).prop('checked',false);
						var $_targetRow = $(e).parent().parent();
						$_targetRow.addClass('hidden');
						$('#hiddenItem tbody').append($_targetRow.clone(true,true));
						_slideUpTr($_targetRow);
					}
				});
				break;
			case 'show':
				$_targetTableBodyBulkActionCheckboxes.each(function(i,e){
					if($(e).prop('checked')){
						$(e).prop('checked',false);
						var $_targetRow = $(e).parent().parent();
						$_targetRow.removeClass('hidden');
						$('#validation tbody').prepend($_targetRow.clone(true,true));
						_slideUpTr($_targetRow);
					}
				});
				break;
			case 'revalidate':
				_processValidationAgain(_targetTableElements);
				break;
		}
	});

	// server address notice
	$(document).on('change','#serverURL',function(e){
		_serverURLChanged();
	});

	$(document).on('click','#serverURLinfo',function(e){
		_serverURLChanged(true);
	});

	function _serverURLChanged(showInfo){
		var _serverURL = $serverURL.val();
		if(!_serverURL) {
			_serverURL = 'https://validator.w3.org/nu/';
			$serverURL.val(_serverURL);
		}
		$.cookie('serverurl',_serverURL);
		if(_serverURL.match(/validator\.w3\.org/)) {
			$('#alertModal').modal('show');
		} else if(showInfo === true){
			$('#alertModal').modal('show');
		}
	}

	function _slideUpTr($tr){
		$tr.find('td')
		.wrapInner('<div style="display: block;" />')
		.parent()
		.find('td > div')
		.slideUp(200, function(){
			$(this).parent().parent().remove();
		});
	}

	function _slideDownTr($tr){
		$tr.find('td')
		.wrapInner('<div style="display: none;" />')
		.parent()
		.find('td > div')
		.slideDown(200, function(){
			var $set = $(this);
			$set.replaceWith($set.contents());
		});
	}

	function _constructIndividualReportAccordion(type,reportData){
		var $_accordionContent = $();
		for(var _dataIndex in reportData){
			var _currentItem = reportData[_dataIndex];
			var _addItem = false;

			if(type === 'error' && _currentItem.type === type) {
				_addItem = true;
			} else if (type === 'warning' && _currentItem.subType === 'warning') {
				_addItem = true;
			} else if (type === 'info' && _currentItem.type === type) {
				_addItem = true;
			} else if(type === 'io') {
				_addItem = true;
			} else if(type === 'nodata') {
				_addItem = true;
			}
			if(_addItem === true){
				var $_modalAccordionTemplate = $($IndividualReportModalAccordionTemplate.html());
				$_modalAccordionTemplate.find('.card-header button').text(_currentItem.message);
				if(type === 'nodata') {
					$_modalAccordionTemplate.find('.card-body').html(_currentItem.extract);
				} else {
					$_modalAccordionTemplate.find('.card-body').html(_escape_html(_currentItem.extract));
				}
				// give id
				var _accordionID = 'result-'+_dataIndex;
				$_modalAccordionTemplate.find('.card-header button').attr('data-target','#'+_accordionID);
				$_modalAccordionTemplate.find('.card-header button').attr('aria-controls',_accordionID);
				$_modalAccordionTemplate.find('.card-body-wrap').attr('id',_accordionID);
				$_modalAccordionTemplate.find('.card-header').attr('id','header-'+_dataIndex);
				$_modalAccordionTemplate.find('.card-body-wrap').attr('aria-labelledby','header-'+_dataIndex);

				$_accordionContent = $_accordionContent.add($_modalAccordionTemplate);
			}
		}
		// add show
		// $_accordionContent.first().find('.card-body-wrap').addClass('show');
		// populate accordion
		var $_modalAccordion = $IndividualReportModal.find('#modalAccordion');
		// empty once
		$_modalAccordion.html('');
		// add the accordion
		$_modalAccordion.append($_accordionContent);
	}


	function _processValidationByURL(urlListArray){
		// clear table
		$validationResultsTable.html('');
		// counter
		var _serverURL = $serverURL.val();
		var _itemCounter = 0;
		// scan through the url list array
		for(var _index in urlListArray){
			var _currentItemURL = urlListArray[_index];
			if(_currentItemURL.match(/^https?:\/\//)) {
				$validationResultsTable.append(_getBlankResultItemHTML(_index,_currentItemURL));
				// delay for requests to https://validator.w3.org/nu/
				if(_serverURL.match(/validator\.w3\.org/)) {
					_delayedValidationRequest(_index,_currentItemURL,_itemCounter);
				} else {
					_delayedValidationRequest(_index,_currentItemURL,_itemCounter,860);
				}
				_itemCounter++;
				currentRequestsInQueue++;
			}
		}
		$serverURL.attr('disabled',false);
		if(_itemCounter > 0) {
			$hiddenItemTab.removeClass('disabled');
			totalRequestEnqueued = currentRequestsInQueue;
			if(currentRequestsInQueue > 0) {
				_showValidationProgressBar();
			}
		}
	}

	function _processValidationAgain(targetCheckboxes){
		var _counter = 0;
		// clear table
		$(targetCheckboxes).each(function(i,e){
			var _serverURL = $serverURL.val();
			var $_targetElement = $(e);
			var _isAvailablee = ($_targetElement.prop("checked") && !$_targetElement.attr("disabled")) ? true : false;
			var $_targetRow = $_targetElement.parent().parent();
			// make sure that the row is not busy and checked
			if( _isAvailablee === true ){
				// reset display
				$_targetElement.attr("disabled",true);
				$_targetRow.find('.resultStatus').html('<span class="badge badge-secondary">Requesting</span>');
				$_targetRow.find('.resultError').html('-');
				$_targetRow.find('.resultWarning').html('-');
				$_targetRow.find('.resultInfo').html('-');
				$_targetRow.removeAttr('data-errorType');
				// get attributes
				var _id = $_targetRow.attr('data-resultid');
				var _currentItemURL = $_targetRow.attr('data-validationurl');
				// delay for requests to https://validator.w3.org/nu/
				if(_serverURL.match(/validator\.w3\.org/)) {
					_delayedValidationRequest(_id,_currentItemURL,i);
				} else {
					_delayedValidationRequest(_id,_currentItemURL,i,860);
				}
				currentRequestsInQueue++;
				_counter++;
			}

		});
		$serverURL.attr('disabled',false);
		var _notifyMessage = '';
		if(_counter > 0) {
			totalRequestEnqueued = currentRequestsInQueue;
			if(validationProgressNotification_state === false ){
				_showValidationProgressBar();
			} else {
				_notifyMessage = 'Validation requests added to the current queue.';
			}
		} else if (_counter < 1) {
			_notifyMessage = 'Please tick checkboxes of items to be validated.';
		} else if (currentRequestsInQueue > 0) {
			_notifyMessage = 'Other validations are in progress. Please wait till all the pending queues are processed.';
		} else {
			_notifyMessage = 'Please tick checkboxes of items to be validated.';
		}

		// show notification popup
		if(_notifyMessage !== ''){
			$.notify({
				// options
				message: _notifyMessage
			},{
				// settings
				type: 'warning',
				timer: 700,
				animate: {
					enter: 'animated fadeInDown fastAnimation',
					exit: 'animated fadeOutUp'
				},
			});
		}
	}

	function _delayedValidationRequest(id,currentItemURL,counter,waitDuration){
		// default is 5 seconds
		if(!waitDuration) waitDuration = 5000;
		setTimeout(function(){
			requestValidation(id,currentItemURL);
		}, counter * waitDuration);
	}

	function requestValidation(index,url){
		var _serverURL = $serverURL.val();
		var $_targetTableRow = $('[data-resultID='+index+']');
		var _requestURLstring = _serverURL+'?out=json&doc='+url;
		//AJAX
		$.ajax({
			url:_requestURLstring,
			type:'GET',
		})
		.done(function(data){
			if('messages' in data) {
				if(!data.messages[0]) {
					$_targetTableRow.find('.resultStatus span').addClass('badge-dark').text('No Data');
					$_targetTableRow.attr('data-errorType','nodata');
					validationResultsCollection[index] = {'url':data.url,'messages':[{
						'message': 'No data returned from the server. Please validate manually.',
						'extract': '<a href="'+ _serverURL+'?doc='+url+'" target="_blank" class="btn btn-primary btn-lg btn-block">Click here to validate manually.</a>',
						'type': 'nodata',
					}]};
					// enable checkbox
					$_targetTableRow.find('.bulkActionCheckbox').attr('disabled',false);
				} else if(data.messages[0].type === 'non-document-error') {
					$_targetTableRow.find('.resultStatus span').addClass('badge-dark').text('Non Document');
					$_targetTableRow.attr('data-errorType',data.messages[0].subType);
					validationResultsCollection[index] = data;
					// enable checkbox
					$_targetTableRow.find('.bulkActionCheckbox').attr('disabled',false);
				} else {
					var _error = 0;
					var _warning = 0;
					var _info = 0;
					for(var _messageIndex in data.messages) {
						var _result = data.messages[_messageIndex];
						if(_result.type === 'error') {
							_error++;
						} else if(_result.type === 'info' && _result.subType === 'warning') {
							_warning++;
						} else if(_result.type === 'info'){
							_info++;
						}
					}
					// store data to collection
					validationResultsCollection[index] = data;
					// label
					$_targetTableRow.find('.resultStatus span').addClass('badge-success').text('Validated');
					// info
					if(_info) $_targetTableRow.find('.resultInfo').html('<span class="badge badge-info">'+_info+'</span>');
					// warning
					if(_warning) $_targetTableRow.find('.resultWarning').html('<span class="badge badge-warning">'+_warning+'</span>');
					// error
					if(_error) $_targetTableRow.find('.resultError').html('<span class="badge badge-danger">'+_error+'</span>');
					// enable checkbox
					$_targetTableRow.find('.bulkActionCheckbox').attr('disabled',false);
				}
			} else {
				$_targetTableRow.find('.resultStatus span').addClass('badge-danger').text('Failed');
			}
		})
		.fail(function(){
			$_targetTableRow.find('.resultStatus span').addClass('badge-danger').text('Failed');
		})
		.always(function() {
			$_targetTableRow.find('.bulkActionCheckbox').prop("checked",false);
			currentRequestsInQueue--;
			if(currentRequestsInQueue < 1){
				$.notify({
					// options
					message: 'Validation Complete'
				},{
					// settings
					type: 'success',
					timer: 700,
					animate: {
						enter: 'animated fadeInDown fastAnimation',
						exit: 'animated fadeOutUp'
					},
				});
				validationProgressNotification.close();
				totalRequestEnqueued = 0;
				currentRequestsInQueue = 0;
			} else {
				validationProgressNotification.update({'type': 'success', 'message': (totalRequestEnqueued-currentRequestsInQueue)+' out of '+totalRequestEnqueued+' validation items processed.', 'progress': 100 - currentRequestsInQueue/totalRequestEnqueued * 100});
			}
		});
	}

	function _getBlankResultItemHTML(index,url){
		var _labelURL = _getBaseName(url);
		return '<tr class="validationResultItem" data-resultID="'+index+'" data-validationURL="'+url+'"><th scope="row" class="resultID">'+index+'</th><td class="resultURL"><a href="'+url+'" target="_blank">'+_labelURL+'</a></td><td class="resultError">-</td><td class="resultWarning">-</td><td class="resultInfo">-</td><td class="resultStatus"><span class="badge badge-secondary">Requesting</span></td><td class="hideResult"><input class="bulkActionCheckbox" type="checkbox" aria-label="Checkbox for hiding" disabled="disabled"></td></tr>';
	}

	function _getBaseName(url){
		url = url.replace(/\/$/, '');
		return url.substr(url.lastIndexOf('/') + 1);
	}

	function _escape_html (string) {
		if(typeof string !== 'string') {
			return string;
		}
		return string.replace(/[&'`"<>]/g, function(match) {
			return {
				'&': '&amp;',
				"'": '&#x27;',
				'`': '&#x60;',
				'"': '&quot;',
				'<': '&lt;',
				'>': '&gt;',
			}[match]
		});
	}

	/**
	 * Progress bar
	 */
	function _showValidationProgressBar(){
		validationProgressNotification = $.notify({
			// options
			message: 'Stating Validation'
		},{
			// settings
			type: 'info',
			allow_dismiss: false,
			showProgressbar: true,
			delay: 0,
			animate: {
				enter: 'animated fadeInDown fastAnimation',
				exit: 'animated fadeOutUp'
			},
			'progress': 0,
			onShow: function(){
				validationProgressNotification_state = true;
			},
			onClosed: function(){
				validationProgressNotification_state = false;
			}
		});
	}

	/**
	 * Back to top
	 * @see        https://www.w3schools.com/howto/howto_js_scroll_to_top.asp
	 */

	// When the user scrolls down 20px from the top of the document, show the button
	window.onscroll = function() {scrollFunction()};

	function scrollFunction() {
		if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
			document.getElementById("backToTop").style.display = "block";
		} else {
			document.getElementById("backToTop").style.display = "none";
		}
	}

})(window.jQuery);


// When the user clicks on the button, scroll to the top of the document
function topFunction() {
	$('html,body').animate({scrollTop: 0}, 500, 'swing');
}
