#!/bin/env python2
#
# netwatch
# (C) 2017-18 Emanuele Faranda
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
import web
from presence_db import PresenceDB
from meta_db import MetaDB
from utils.jobs import Job
from utils.data import getDevicesData, getUsersData
from utils.timeutils import makeEndTimestamp
import time
import config
import json
import threading

# web.config.debug = False
TEMPLATES = 'html/'
WEB_PORT = 8000
template_render = web.template.render(TEMPLATES, base='layout')

class MyApplication(web.application):
  def run(self, port=WEB_PORT, *middleware):
    func = self.wsgifunc(*middleware)
    return web.httpserver.runsimple(func, ('0.0.0.0', port))

def sendJsonData(data):
  web.header('Content-Type', 'application/json')
  return json.dumps(data, ensure_ascii=True)

def resToMinTime(res):
  if res == "1M":
    return 86400*31
  elif res == "24h":
    return 86400
  elif res == "1h":
    return 240
  else:
    return 10

class timeline:
  def GET(self):
    params = web.input()

    # TODO handle now
    timestamp = "now"
    resolution = "1m"

    try:
      timestamp = params.ts
      resolution = params.res
    except AttributeError:
      pass

    presence_db = PresenceDB()
    meta_db = MetaDB()
    ts_start = None
    ts_end = None

    if timestamp == "now":
      ts_end = time.time()
      ts_start = ts_end - 20 * 60
    else:
      ts_start = int(timestamp)
      ts_end = makeEndTimestamp(ts_start, resolution)

    presence_data = presence_db.query(ts_start, ts_end, resolution=resolution)
    configured_devices = config.getConfiguredDevices()
    min_time = resToMinTime(resolution)

    data = []
    for device, intervals in presence_data.iteritems():
      name = device
      name_on_packet = ""

      meta = meta_db.query(device)

      if meta and meta["name"]:
        name_on_packet = meta["name"]

      if device in configured_devices:
        name = configured_devices[device]["custom_name"]
      elif name_on_packet:
        name = name_on_packet

      for interval in intervals:
        data.append((name, "", interval[0], interval[1], device, name_on_packet))

    data.sort()

    return template_render.timeline(json.dumps(data, ensure_ascii=True), ts_start, ts_end, resolution, min_time)

class devices:
  def GET(self):
    return template_render.devices(config)

  def POST(self):
    data = web.input()
    action = data.action
    mac = data.mac
    overwrite = False
    user = ""

    if (action == "add") or (action == "edit"):
      if action == "edit":
        overwrite = True
        user = data.user

      custom_name = data.custom_name
      active_ping = False
      trigger_activity = False

      # Optional
      try:
        active_ping = data.active_ping and True
      except AttributeError: pass
      try:
        trigger_activity = data.trigger_activity and True
      except AttributeError: pass

      config.addDevice(mac, custom_name, active_ping, user, trigger_activity, overwrite=overwrite)
    elif action == "delete":
      config.deleteDevice(mac)

    raise web.seeother('/devices')

class people:
  def GET(self):
    return template_render.people()

  def POST(self):
    data = web.input()
    action = data.action
    username = data.username
    old_username = None

    if (action == "add") or (action == "edit"):
      avatar = data.avatar

      if action == "edit":
        old_username = data.old_username

      config.addUser(username, avatar, old_username)
    elif action == "delete":
      config.deleteUser(username)

    raise web.seeother('/people')

class settings:
  def GET(self):
    return template_render.settings(config)

  def POST(self):
    data = web.input()
    periodic_discovery = False

    try:
        periodic_discovery = data.periodic_discovery and True
    except AttributeError: pass

    config.setPeriodicDiscoveryEnabled(periodic_discovery)

    raise web.seeother('/settings')

class about:
  def GET(self):
    return template_render.about()

class devices_json:
  def GET(self):
    meta_db = MetaDB()
    return sendJsonData(getDevicesData(meta_db))

class users_json:
  def GET(self):
    meta_db = MetaDB()
    return sendJsonData(getUsersData(meta_db))

class WebServerJob(Job):
  def __init__(self):
    urls = (
      '/', 'timeline',
      '/devices', 'devices',
      '/people', 'people',
      '/settings', 'settings',
      '/about', 'about',
      '/data/devices.json', 'devices_json',
      '/data/users.json', 'users_json',
    )

    super(WebServerJob, self).__init__("web_server", self.run)
    self.stop_checker_thread = None
    self.app = MyApplication(urls, globals())

  # This is necessary since we cannot call self.app.stop from another process
  def _checkTermination(self):
    self.waitTermination()
    self.app.stop()

  def run(self, *args):
    self.stop_checker_thread = threading.Thread(target=self._checkTermination, args=())
    self.stop_checker_thread.start()
    self.app.run()
    self.stop_checker_thread.join()

if __name__ == "__main__":
  WebServerJob().run()
