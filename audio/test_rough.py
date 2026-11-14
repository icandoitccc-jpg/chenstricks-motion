import unittest,rough,math
class TestRough(unittest.TestCase):
 def test_merge(self):self.assertEqual(rough.intervals(10,[{'start':2,'end':4},{'start':3,'end':5}]),[(0,2),(5,10)])
 def test_invalid(self):
  for cuts in [[{'start':0,'end':10}],[{'start':float('nan'),'end':3}],[{'start':-1,'end':2}]]:
   with self.assertRaises(ValueError):rough.intervals(10,cuts)
 def test_rebase(self):
  cues=[{'text':'一','start':1,'end':2},{'text':'二','start':5,'end':7}]
  out=rough.edited_cues(cues,[(0,3),(5,10)]);self.assertEqual([(c['start'],c['end']) for c in out],[(1,2),(3,5)]);self.assertFalse(out[1]['needsReview'])
 def test_partial_text_not_trusted(self):self.assertTrue(rough.edited_cues([{'text':'一整句话','start':1,'end':4}],[(0,2),(3,5)])[0]['needsReview'])
unittest.main()
