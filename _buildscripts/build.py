#!/usr/bin/env python3
"""main build script."""

import argparse
import configparser
import re
from pathlib import Path
from os import environ
from shutil import copytree

extra_version = ''

def readtext(filename):
  return filename.read_text(encoding='utf-8-sig')

def fill_meta(source, script_name):
  meta = ['// ==UserScript==']
  keys = set()

  def append_line(key, value):
    if key not in keys:
      meta.append(f'// @{key:<14} {value}')
      keys.add(key)

  for line in source.splitlines():
    text = line.lstrip()
    rem = text[:2]
    if rem != '//':
      raise UserWarning(f'{script_name}: wrong line in metablock: {line}')
    text = text[2:].strip()
    try:
      key, value = text.split(None, 1)
    except ValueError:
      if text == '==UserScript==':
        # raise UserWarning(f'{script_name}: wrong metablock detected')
        continue
      elif text == '==/UserScript==':
        # raise UserWarning(f'{script_name}: wrong metablock detected')
        continue
    else:
      if key[0] == '@':
        key = key[1:]
      else:  # continue previous line
        meta[-1] += ' ' + text
        continue

      if key == 'version':
        value += extra_version
        sversion = value
        if not re.match(r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$', value):
          print(f'{script_name}: wrong version format: {value}')  # expected: major.minor.patch
      elif key == 'name':
          sname = value 
          value = 'WFES - ' + value
      elif key == 'description':
        sdescription = value 

      append_line(key,value)

  append_line('namespace', cfg['namespace'])
  append_line('homepage', cfg['homepage'])
  append_line('supportURL', cfg['supportURL'])
  append_line('icon', 'https://wayfarer.nianticlabs.com/imgpub/favicon-256.png')

  url_dist_base = cfg.get('url_dist_base',fallback = False)
  if url_dist_base:
    path = url_dist_base + script_name
    surl = path + '.user.js'
    if keys.isdisjoint({'downloadURL'}):
      append_line('downloadURL', path + '.user.js')
      append_line('updateURL', path + '.meta.js')

  if keys.isdisjoint({'match', 'include'}):
    append_line('match', cfg['match'])

  append_line('grant', 'none')
  meta.append('// ==/UserScript==\n\n')
  
  sl = '  * [{}]({}) {}\n    - {}\n'.format(sname,surl,sversion,sdescription)
  return '\n'.join(meta), sl

def process_file(source, out_dir):
  """Generate .user.js and .meta.js from given source file.

    Resulted file(s) put into out_dir (if specified, otherwise - use current).
    """
  try:
    meta, script = readtext(source).split('\n\n', 1)
  except ValueError:
    raise Exception(f'{source}: wrong input: empty line expected after metablock')

  script_name = source.stem
  
  meta, shortl = fill_meta(meta, script_name)
  
  data = [
    meta,
    script
    ]

  (out_dir / (script_name + '.user.js')).write_text(''.join(data), encoding='utf8')
  (out_dir / (script_name + '.meta.js')).write_text(meta, encoding='utf8')
  return shortl

def run():
  global extra_version
  source = Path('..')
  target = Path('../build')

  target.mkdir(parents=True,exist_ok = True)
  
  # copy all from _pages
  pagesrc = source / '_pages/'
  copytree(pagesrc,target,dirs_exist_ok=True) 
  
  # copy LICENSE
  print('process LICENSE')
  lic = source / 'LICENSE'
  # tf = target / lic.name
  tf = target / 'LICENSE.txt'
  lic.link_to(tf)

  # check if beta (issue, hotfix, feature)
  ref = re.match('refs/heads/(\w+)(/[\w#\-]+)?',environ['GITHUB_REF'])
  if ref:
    if ref.group(1) == 'issue':
      extra_version = '.beta'+environ['GITHUB_RUN_NUMBER']+'.issue' + ref.group(2)[2:]
    elif (ref.group(1) == 'feature')|(ref.group(1) == 'hotfix'):
      extra_version = '.beta'+environ['GITHUB_RUN_NUMBER']+'.' + ref.group(1) + '.' + ref.group(2)[1:]
  
  # process js files
  shortlist = []
  shortlist.append('## shortlist\n\n')
  shortlist.append('created automatically\n\n')
  shortlist.append('Not all scripts on this page are fully functional. This list is for reference only. Use at your own risk.\n\n')
  
  all_files = list(source.glob('**/wfes*.js'))
  all_files.sort(key=lambda self: self.parts[-1].lower())
  for filename in all_files:
    print('process file {} {}'.format(filename,target))
    short = process_file(
      filename,
      target
      )
    shortlist.append(short)

  shortdest = target / 'shortlist.md'
  shortdest.write_text(''.join(shortlist), encoding='utf8')

##### MAIN ######

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('--config_file', '-c', help='config file', default='build.ini')
  args = parser.parse_args()
  
  config = configparser.ConfigParser()
  config.read(args.config_file)
  cfg = config['defaults']
  run()
