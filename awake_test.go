package main

import "testing"

func TestKeepAwakeHoldsOnceAndReleases(t *testing.T) {
	held, released := 0, 0
	defer func(prev func(string) (func(), error)) { holdAwake = prev }(holdAwake)
	holdAwake = func(reason string) (func(), error) {
		if reason == "" {
			t.Fatal("no reason given")
		}
		held++
		return func() { released++ }, nil
	}
	s := &EditorService{}
	for _, on := range []bool{true, true, false, false, true} {
		if err := s.KeepAwake(on); err != nil {
			t.Fatal(err)
		}
	}
	if held != 2 || released != 1 {
		t.Fatalf("held %d, released %d", held, released)
	}
	if err := s.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	if released != 2 {
		t.Fatal("shutdown left the display held")
	}
}
