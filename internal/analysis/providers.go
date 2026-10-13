package analysis

import (
	"mousqueau/internal/i18n"
	"net/http"
	"net/url"
	"strings"
)

// Info describes a transcription provider the user can add in Settings.
type Info struct {
	ID   string `json:"id"`
	Name string `json:"name"` // a brand name, or an English name to translate
	// Region is "international", "china" for services under mainland China's
	// jurisdiction, or "custom" for an endpoint the user supplies.
	Region string `json:"region"`
	// Credentials names the secret's parts: "apiKey", or "secretId" and
	// "secretKey". EnvVars gives an environment variable for each part.
	Credentials  []string `json:"credentials"`
	EnvVars      []string `json:"envVars"`
	DefaultModel string   `json:"defaultModel"`
	Models       []string `json:"models"`
	Endpoint     bool     `json:"endpoint"`    // the user supplies the service URL
	KeyOptional  bool     `json:"keyOptional"` // e.g. a local server
	Diarization  bool     `json:"diarization"` // false: speakers may come back unknown
}

// Caution reports whether uploads go to a service whose content and data
// handling the user should weigh before sending sensitive audio.
func (i Info) Caution() bool { return i.Region != "international" }

var providers = []Info{
	{ID: "openai", Name: "OpenAI", Region: "international", Credentials: []string{"apiKey"}, EnvVars: []string{"OPENAI_API_KEY"},
		DefaultModel: "gpt-4o-transcribe-diarize", Models: []string{"gpt-4o-transcribe-diarize"}, Diarization: true},
	{ID: "deepgram", Name: "Deepgram", Region: "international", Credentials: []string{"apiKey"}, EnvVars: []string{"DEEPGRAM_API_KEY"},
		DefaultModel: "nova-2", Models: []string{"nova-2", "nova-3"}, Diarization: true},
	{ID: "assemblyai", Name: "AssemblyAI", Region: "international", Credentials: []string{"apiKey"}, EnvVars: []string{"ASSEMBLYAI_API_KEY"},
		Models: []string{"universal", "best", "nano"}, Diarization: true},
	{ID: "elevenlabs", Name: "ElevenLabs", Region: "international", Credentials: []string{"apiKey"}, EnvVars: []string{"ELEVENLABS_API_KEY"},
		DefaultModel: "scribe_v2", Models: []string{"scribe_v2", "scribe_v1"}, Diarization: true},
	{ID: "alibaba", Name: i18n.N("Alibaba Cloud Model Studio"), Region: "china", Credentials: []string{"apiKey"}, EnvVars: []string{"DASHSCOPE_API_KEY"},
		DefaultModel: "paraformer-v2", Models: []string{"paraformer-v2", "fun-asr"}, Diarization: true},
	{ID: "tencent", Name: i18n.N("Tencent Cloud ASR"), Region: "china", Credentials: []string{"secretId", "secretKey"}, EnvVars: []string{"TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY"},
		DefaultModel: "16k_zh", Models: []string{"16k_zh", "16k_zh_video"}, Diarization: true},
	{ID: "custom", Name: i18n.N("Custom (OpenAI-compatible)"), Region: "custom", Credentials: []string{"apiKey"}, EnvVars: []string{},
		Models: []string{}, Endpoint: true, KeyOptional: true},
}

// Providers lists every provider in the order Settings offers them.
func Providers() []Info { return append([]Info(nil), providers...) }

func Lookup(id string) (Info, bool) {
	for _, p := range providers {
		if p.ID == id {
			return p, true
		}
	}
	return Info{}, false
}

// Config is what the user chose for a provider; empty fields use defaults.
type Config struct {
	Model    string
	Endpoint string
}

// New builds the provider. secret holds one value per credential part.
func New(id string, cfg Config, secret []string, c *http.Client) (Provider, error) {
	info, ok := Lookup(id)
	if !ok {
		return nil, i18n.Errorf("unknown analysis provider")
	}
	part := func(i int) string {
		if i < len(secret) {
			return secret[i]
		}
		return ""
	}
	model := cfg.Model
	if model == "" {
		model = info.DefaultModel
	}
	switch id {
	case "openai":
		return OpenAI{Key: part(0), Model: model, Client: c}, nil
	case "deepgram":
		return Deepgram{Key: part(0), Model: model, Client: c}, nil
	case "assemblyai":
		return AssemblyAI{Key: part(0), Model: model, Client: c}, nil
	case "elevenlabs":
		return ElevenLabs{Key: part(0), Model: model, Client: c}, nil
	case "alibaba":
		return DashScope{Key: part(0), Model: model, Client: c}, nil
	case "tencent":
		return Tencent{SecretID: part(0), SecretKey: part(1), Model: model, Client: c}, nil
	case "custom":
		if err := ValidateEndpoint(cfg.Endpoint); err != nil || cfg.Endpoint == "" || model == "" {
			return nil, i18n.Errorf("enter the service URL and model for %s in Settings", i18n.T(info.Name))
		}
		return OpenAI{Key: part(0), Endpoint: TranscriptionURL(cfg.Endpoint), Model: model, Name: i18n.T(info.Name), Client: c}, nil
	}
	return nil, i18n.Errorf("unknown analysis provider")
}

// ValidateEndpoint accepts an empty value, an HTTPS URL, or plain HTTP to
// this computer for a local server.
func ValidateEndpoint(raw string) error {
	if raw == "" {
		return nil
	}
	u, err := url.Parse(raw)
	local := err == nil && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1")
	if err != nil || len(raw) > 300 || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		!(u.Scheme == "https" || u.Scheme == "http" && local) {
		return i18n.Errorf("enter an HTTPS URL, or an HTTP URL on this computer")
	}
	return nil
}

// TranscriptionURL completes a base URL such as https://host/v1 with the
// OpenAI transcription path, unless it already ends in it.
func TranscriptionURL(base string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(base, "/audio/transcriptions") {
		return base
	}
	return base + "/audio/transcriptions"
}

// ValidateModel accepts the characters model and engine names use.
func ValidateModel(model string) error {
	if len(model) > 100 {
		return i18n.Errorf("model name is too long")
	}
	for _, r := range model {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("._:/@+-", r)) {
			return i18n.Errorf("model names may contain only letters, digits and . _ : / @ + -")
		}
	}
	return nil
}
