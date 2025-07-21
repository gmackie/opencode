// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

package opencode

import (
	"context"
	"net/http"

	"github.com/sst/opencode-sdk-go/internal/apijson"
	"github.com/sst/opencode-sdk-go/internal/requestconfig"
	"github.com/sst/opencode-sdk-go/option"
)

// AudioService contains methods and other services that help with interacting with
// the opencode API.
//
// Note, unlike clients, this service does not read variables from the environment
// automatically. You should not instantiate this service directly, and instead use
// the [NewAudioService] method instead.
type AudioService struct {
	Options []option.RequestOption
}

// NewAudioService generates a new service that applies the given options to each
// request. These options are applied after the parent client's options (if there
// is one), and before any request-specific options.
func NewAudioService(opts ...option.RequestOption) (r *AudioService) {
	r = &AudioService{}
	r.Options = opts
	return
}

// Trigger audio notification
func (r *AudioService) Notify(ctx context.Context, body AudioNotifyParams, opts ...option.RequestOption) (res *bool, err error) {
	opts = append(r.Options[:], opts...)
	path := "audio/notify"
	err = requestconfig.ExecuteNewRequest(ctx, http.MethodPost, path, body, &res, opts...)
	return
}

type AudioNotifyParams struct {
	ProjectName string  `json:"projectName,required"`
	Status      string  `json:"status,required"`
	SessionID   *string `json:"sessionID"`
}

func (r AudioNotifyParams) MarshalJSON() (data []byte, err error) {
	return apijson.MarshalRoot(r)
}

func (r AudioNotifyParams) implementsAudioNotifyParams() {}

type AudioNotifyParamsParam interface {
	implementsAudioNotifyParams()
}