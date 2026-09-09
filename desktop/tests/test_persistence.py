import importlib.util
import json
import socket
import sqlite3
import tempfile
import unittest
from pathlib import Path
from contextlib import closing
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('desktop_run', Path(__file__).parents[1] / 'run.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PersistenceTests(unittest.TestCase):
    def test_original_database_has_a_consistent_one_time_recovery_copy(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, '_default_data_dir', return_value=Path(directory)):
            source = sqlite3.connect(Path(directory) / 'f1nancer.db')
            source.execute('CREATE TABLE preserved (value TEXT)')
            source.execute("INSERT INTO preserved VALUES ('original')")
            source.commit()
            module._preserve_legacy_database()
            source.execute("UPDATE preserved SET value='later'")
            source.commit()
            module._preserve_legacy_database()
            with closing(sqlite3.connect(Path(directory) / 'before-cloud-repair.db')) as recovery:
                self.assertEqual(recovery.execute('SELECT value FROM preserved').fetchone()[0], 'original')
            self.assertEqual(source.execute('SELECT value FROM preserved').fetchone()[0], 'later')
            source.close()

    def test_origin_survives_restart(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, '_default_data_dir', return_value=Path(directory)):
            first = module._free_port()
            self.assertEqual(first, module._free_port())
            self.assertEqual(str(first), (Path(directory) / 'desktop-port').read_text())

    def test_busy_origin_never_silently_switches(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, '_default_data_dir', return_value=Path(directory)):
            port = module._free_port()
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', port))
                with self.assertRaisesRegex(RuntimeError, 'preserved'):
                    module._free_port()
            self.assertEqual(port, module._free_port())

    def test_dialog_export_and_import_and_cancellation(self):
        with tempfile.TemporaryDirectory() as directory:
            filename = Path(directory) / 'backup.json'
            api = module._DesktopApi()
            class Window:
                def create_file_dialog(self, *args, **kwargs): return [str(filename)]
            api._window = Window()
            payload = json.dumps({'format': 'f1nancer-backup'})
            self.assertTrue(api.save_backup(payload))
            self.assertEqual(payload, api.open_backup())
            api._window.create_file_dialog = lambda *a, **k: None
            self.assertFalse(api.save_backup(payload))
            self.assertIsNone(api.open_backup())

if __name__ == '__main__': unittest.main()
