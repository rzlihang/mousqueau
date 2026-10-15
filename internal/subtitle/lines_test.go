package subtitle

import (
	"slices"
	"strings"
	"testing"
)

func TestJoinText(t *testing.T) {
	for _, tc := range [][3]string{
		{"Hello", "there", "Hello there"},
		{"你好，", "世界", "你好，世界"},
		{"Line one\n", "  two", "Line one two"},
		{"OK", "。", "OK。"},
	} {
		if got := JoinText(tc[0], tc[1]); got != tc[2] {
			t.Errorf("JoinText(%q, %q) = %q", tc[0], tc[1], got)
		}
	}
}

func TestDialogueDashesBecomeLines(t *testing.T) {
	cues, err := Parse("1\n00:00:01,000 --> 00:00:02,000\n-这是没钱 要没钱\n– 要钱了呗\n\n2\n00:00:02,000 --> 00:00:03,000\n- 只有一行\n\n3\n00:00:03,000 --> 00:00:04,000\n第一行\n- 第二行\n")
	if err != nil {
		t.Fatal(err)
	}
	c := cues[0]
	if len(c.Lines) != 2 || c.Lines[0].Text != "这是没钱 要没钱" || c.Lines[1].Text != "要钱了呗" || c.Text != "- 这是没钱 要没钱\n- 要钱了呗" {
		t.Fatalf("dialogue: %+v", c)
	}
	if cues[1].Lines != nil || cues[1].Text != "- 只有一行" || cues[2].Lines != nil {
		t.Fatalf("single or mixed lines changed: %+v", cues[1:])
	}
	out, err := Render(cues)
	if err != nil || !strings.Contains(out, "- 这是没钱 要没钱\n- 要钱了呗\n") {
		t.Fatalf("render: %q %v", out, err)
	}
}

func TestNormalizeFollowsLines(t *testing.T) {
	c, err := Normalize(Cue{Identifier: "1", Text: "stale", Lines: []Line{
		{Text: " 这是没钱 要没钱 ", SpeakerIDs: []string{"B"}},
		{Text: "要钱了呗", SpeakerIDs: []string{"A"}},
		{Text: "要没钱"},
	}})
	if err != nil || c.Text != "- 这是没钱 要没钱\n- 要钱了呗\n- 要没钱" || !slices.Equal(c.SpeakerIDs, []string{"B", "A"}) || c.Lines[2].SpeakerIDs == nil {
		t.Fatalf("normalize: %+v %v", c, err)
	}
	one, err := Normalize(Cue{Lines: []Line{{Text: "只剩一行", SpeakerIDs: []string{"A"}}}})
	if err != nil || one.Lines != nil || one.Text != "只剩一行" || one.SpeakerIDs[0] != "A" {
		t.Fatalf("one line: %+v", one)
	}
	for _, bad := range []string{"", "  ", "两\n行"} {
		if _, err := Normalize(Cue{Lines: []Line{{Text: "ok"}, {Text: bad}}}); err == nil {
			t.Fatalf("accepted line %q", bad)
		}
	}
}

func TestRetextKeepsSpeakersOnlyWhenLinesStillMatch(t *testing.T) {
	lines := []Line{{Text: "a", SpeakerIDs: []string{"A"}}, {Text: "b", SpeakerIDs: []string{"B"}}}
	got := Retext(lines, "- 甲\n- 乙")
	if len(got) != 2 || got[0].Text != "甲" || got[1].SpeakerIDs[0] != "B" {
		t.Fatalf("retext: %+v", got)
	}
	if Retext(lines, "甲乙") != nil || Retext(lines, "- 甲\n- 乙\n- 丙") != nil {
		t.Fatal("kept lines that no longer match")
	}
}

func TestAsLinesUnwrapsAnOrdinaryCue(t *testing.T) {
	got := AsLines(Cue{Text: "第一行\n第二行", SpeakerIDs: []string{"A"}})
	if len(got) != 1 || got[0].Text != "第一行第二行" || got[0].SpeakerIDs[0] != "A" {
		t.Fatalf("as lines: %+v", got)
	}
	if got := AsLines(Cue{Text: "Hello\nthere"}); got[0].Text != "Hello there" {
		t.Fatalf("latin: %+v", got)
	}
}
