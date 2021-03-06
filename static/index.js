/*
 * netwatch
 * (C) 2017-18 Emanuele Faranda
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

function dateZeroHour(dt) {
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function dateTolocaldate(ev_dt, sign) {
  sign = typeof sign !== "undefined" ? sign : 1;
  var dt = new Date(ev_dt);
  var ts_local = dt.getTime() + sign * new Date().getTimezoneOffset() * 60 * 1000;
  return new Date(ts_local);
}

function makeDateTimePicker(picker_id, timestamp, resolution) {
  var selector = "#" + picker_id;
  var form = $(selector).closest("form");
  var changing_minute = false;
  var dt_input = $(selector).find("input");
  var res_label = form.find("[data-show-res]");

  var res2label = {
    "1m": "One Hour",
    "1h": "One Day",
    "24h": "One Month",
    "1M": "One Year",
  };

  res_label.val(res2label[resolution]);

  var submitTimeframe = function(dt, res) {
    var ts_input = form.find("input[name='ts']");
    var res_input = form.find("input[name='res']");
    var ts = dt.getTime() / 1000;

    ts_input.val(ts);
    res_input.val(res);
    $(selector).datetimepicker("update", dateTolocaldate(dt, -1));
    res_label.val(res2label[res]);
  };

  var res2view = {
    "1m": 0,
    "1h": 1,
    "24h": 2,
    "1M": 3,
  }

  function drilldownHour(d, sign) {
    var dt = dateTolocaldate(d, sign);

    dt.setMinutes(0);
    dt.setSeconds(0);
    dt.setMilliseconds(0);
    submitTimeframe(dt, "1m");
  }

  function drilldownDay(d, sign) {
    var dt = dateTolocaldate(d, sign);
    submitTimeframe(dateZeroHour(dt), "1h");
  }

  function drilldownMonth(d, sign) {
    var dt = dateTolocaldate(d, sign);
    dateZeroHour(dt);
    dt.setMonth(dt.getMonth(), 1);
    submitTimeframe(dt, "24h");
  }

  var res2click = {
    "1m": $.noop,
    "1h": drilldownHour,
    "24h": drilldownDay,
    "1M": drilldownMonth,
  };

  var startView = res2view[resolution];
  var currentDate = new Date(timestamp * 1000);
  dt_input.val(moment(currentDate).format("YYYY-MM-DD HH:mm"));

  var picker = $(selector).datetimepicker({
    fontAwesome: true,
    minuteStep: 15,
    todayBtn: true,
    endDate: new Date(),
    startView: startView,
  }).on('changeYear', function(ev) {
    var dt = dateTolocaldate(ev.date.valueOf());

    dateZeroHour(dt);
    dt.setMonth(0, 1);
    submitTimeframe(dt, "1M");
  }).on('changeMonth', function(ev) {
    drilldownMonth(ev.date.valueOf());
  }).on('changeDay', function(ev) {
    drilldownDay(ev.date.valueOf());
  }).on('changeHour', function(ev) {
    drilldownHour(ev.date.valueOf());
  }).on('changeMinute', function(ev) {
    var dt = dateTolocaldate(ev.date.valueOf());
    changing_minute = true;

    dt.setSeconds(0);
    dt.setMilliseconds(0);
    submitTimeframe(dt, "1m");
  }).on('changeDate', function(ev) {
    // TODO
    if (! changing_minute)
      console.log("Now ", ev.date.valueOf());
  });

  picker.drillDown = function(dt, sign) {
    res2click[resolution](dt, sign);
  }

  return picker;
}

$.fn.datetimepicker.dates['en'] = $.extend($.fn.datetimepicker.dates['en'], {
  today: "Now",
});

var _netwatch_click_callback_id = 0;

$.fn.netwatchTable = function(custom_options) {
  var default_options = {
    toolbar: '#toolbar',
    iconsPrefix: 'fa',
    pageSize: 10,
    pagination: true,
    search: true,
    icons: {
      paginationSwitchDown: 'fa-collapse-down icon-chevron-down',
      paginationSwitchUp: 'fa-collapse-up icon-chevron-up',
      refresh: 'fa-refresh icon-refresh',
      toggle: 'fa-list-alt icon-list-alt',
      columns: 'fa-th icon-th',
      detailOpen: 'fa-plus icon-plus',
      detailClose: 'fa-minus icon-minus'
    },
  };

  var columns = custom_options.columns || [];

  if (custom_options.actions) {
    columns.push({
      title: 'Actions',
      class: 'text-center',
      formatter: function(value, row, index) {
         var actions_content = [];

         for (var i=0; i<custom_options.actions.length; i++) {
           var action = custom_options.actions[i];
           var callback_id = _netwatch_click_callback_id++;
           var callback_name = "_netwatch_click_cb_" + callback_id;

           /* Create a new global function */
           window[callback_name] = action.click.bind(null, row);

           actions_content.push(`<a href="` + action.modal + `" data-toggle="modal" data-target="` + action.modal + `"
             class="btn ` + action.button + ` btn-sm"
             onclick="` + callback_name + `()">
             <i class="fa ` + action.icon + `"></i></a>`);
         }

         return actions_content.join(" ");
      }
    });
  }

  var options = $.extend({}, default_options, custom_options);
  options.columns = columns;

  return $(this).bootstrapTable(options);
}
