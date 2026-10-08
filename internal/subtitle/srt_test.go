package subtitle

import (
	"strings"
	"testing"
)

func TestRoundTrip(t *testing.T) {
	input := "\ufeff7\r\n00:00:01,001 --> 00:01:00,999\r\n你好\r\n第二行\r\n\r\n7\r\n01:02:03,004 --> 01:02:05,000\r\n重複編號\r\n"
	c, err := Parse(input)
	if err != nil {
		t.Fatal(err)
	}
	if c[0].Identifier != "7" || c[0].Text != "你好\n第二行" || c[0].ID == c[1].ID {
		t.Fatalf("bad parse: %+v", c)
	}
	c[0].SpeakerIDs = []string{"A"}
	out, err := Render(c)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out, "speaker") {
		t.Fatal("speaker metadata leaked")
	}
	again, err := Parse(out)
	if err != nil || again[0].Start != c[0].Start || again[1].Identifier != "7" {
		t.Fatalf("round trip failed %v", err)
	}
}
func TestTime(t *testing.T) {
	for _, s := range []string{"00:00:00,001", "01:59:59,999", "100:00:00,000"} {
		n, err := ParseTime(s)
		if err != nil || FormatTime(n) != s {
			t.Fatalf("time %s %v", s, err)
		}
	}
	if FormatTime(59.9996) != "00:01:00,000" {
		t.Fatal("millisecond rounding")
	}
	for _, s := range []string{"01:60:00,000", "00:00:60,000", "garbage", "-1:00:00,000", "00:00:00,1"} {
		if _, err := ParseTime(s); err == nil {
			t.Fatalf("accepted %s", s)
		}
	}
}
func TestInvalidSRT(t *testing.T) {
	for _, s := range []string{"", "1\n00:00:02,000 --> 00:00:01,000\nx", "x\n00:00:01,000 --> 00:00:02,000\nx", "1\n00:00:01,000 --> 00:00:02,000\n", "1"} {
		if _, err := Parse(s); err == nil {
			t.Fatalf("accepted %q", s)
		}
	}
}

func TestWhitespaceTimingAndBlankLineExport(t *testing.T) {
	cues, err := Parse("1\n00:00:01,000\t-->  00:00:02,000\n字幕")
	if err != nil || len(cues) != 1 {
		t.Fatal(err)
	}
	cues[0].Text = "第一行\n \n第二行"
	if _, err := Render(cues); err == nil {
		t.Fatal("blank line produced invalid SRT")
	}
}
