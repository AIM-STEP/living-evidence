import base64,json,unittest
from connect_online_tunnel import extract_token
class Tests(unittest.TestCase):
 def test_token_and_full_command(self):
  token=base64.b64encode(json.dumps({'a':'a'*32,'t':'00000000-0000-4000-8000-000000000001','s':'synthetic-secret'*4}).encode()).decode()
  for value in [token,'sudo cloudflared service install '+token,'brew install cloudflared && sudo cloudflared service install "'+token+'"']:
   self.assertEqual(extract_token(value),token)
 def test_never_accepts_shell_or_placeholder(self):
  for value in ['aimstep-mac-studio','TOKEN','$(touch /tmp/should-not-exist)','cloudflared run eyJinvalid']:
   with self.assertRaises(ValueError):extract_token(value)
if __name__=='__main__':unittest.main()
