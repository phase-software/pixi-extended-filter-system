const { createMockScope, createMockPipe } = require('./createMock');
const expect = require('chai').expect;
const sinon = require('sinon');

describe('FilterSystem', () =>
{
    it('should not leak any textures', () =>
    {
        const [renderer, [filter]] = createMockScope();
        const mockPipe = createMockPipe(renderer);
        const pipeSpy = sinon.spy(mockPipe, 'returnBridgeTexture');
        const allocSpy = sinon.spy(renderer.filter, 'getFilterTexture');

        expect(mockPipe._bridgeTextures.length, 'Output texture is pooled on open').to.equal(1);

        mockPipe.bridge(filter);
        expect(mockPipe._bridgeTextures.length, 'Input render-texture is pooled after first pass').to.equal(1);

        mockPipe.bridge(filter);
        expect(mockPipe._bridgeTextures.length).to.equal(1);

        mockPipe.closeWith(filter, undefined, true);
        expect(mockPipe._bridgeTextures.length).to.equal(1);

        expect(pipeSpy.callCount).to.equal(3);
        expect(allocSpy.called).to.equal(false);
    });
});
